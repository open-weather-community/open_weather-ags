#!/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Source NVM and set up Node.js environment
export NVM_DIR="/home/openweather/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22.3.0

LOCAL_DIR="/home/openweather/open_weather-ags"
RELEASE_API_URL="https://api.github.com/repos/open-weather-community/open_weather-ags/releases/latest"
LOG_FILE="/home/openweather/cronlog.txt"
LOG_MAX_LINES=1500
LOG_LINES_TO_DELETE=500

# Acquire a lock to prevent concurrent executions
exec 200>/home/openweather/openweather_startup.lockfile
flock -n 200 || exit 1
trap "flock -u 200" EXIT

# Log to cronlog.txt that it is booting up
echo "Booting up at $(date)" >> "$LOG_FILE"

# Wait for system services that handle USB mounting to be ready
wait_for_system_services() {
    echo "Waiting for system services..." >> "$LOG_FILE"
    
    # Wait for systemd to finish basic initialization
    for i in {1..10}; do
        if systemctl is-system-running --quiet 2>/dev/null || systemctl is-system-running | grep -E "(running|degraded)" >/dev/null 2>&1; then
            echo "System services ready after $((i*2)) seconds" >> "$LOG_FILE"
            break
        fi
        echo "Waiting for systemd... attempt $i/10" >> "$LOG_FILE"
        sleep 2
    done
    
    # Wait specifically for udev to settle (important for USB device detection)
    if command -v udevadm >/dev/null 2>&1; then
        echo "Waiting for udev to settle..." >> "$LOG_FILE"
        timeout 30 udevadm settle 2>/dev/null || echo "udev settle timeout" >> "$LOG_FILE"
    fi
    
    # Give a bit more time for any auto-mounting services
    sleep 5
}

wait_for_system_services

# Ensure the log file exists
if [ ! -f "$LOG_FILE" ]; then
    touch "$LOG_FILE"
fi

# Truncate the log file if it exceeds maximum lines
LINE_COUNT=$(wc -l < "$LOG_FILE")
if [ "$LINE_COUNT" -gt "$LOG_MAX_LINES" ]; then
    echo "Truncating log file. Deleting first $LOG_LINES_TO_DELETE lines." >> "$LOG_FILE"
    sed -i "1,${LOG_LINES_TO_DELETE}d" "$LOG_FILE" || echo "Failed to truncate log file" >> "$LOG_FILE"
fi

# Network readiness check with ping test
check_network() {
    for i in {1..30}; do  # 30 attempts * 2s = 60s total
        if ping -c 1 -W 1 google.com >/dev/null 2>&1; then
            echo "Network ready after $((i*2)) seconds" >> "$LOG_FILE"
            return 0
        fi
        sleep 2
    done
    echo "Network unavailable after 60 seconds" >> "$LOG_FILE"
    return 1
}

echo "Checking network connectivity..." >> "$LOG_FILE"
if ! check_network; then
    echo "Network check failed, continuing anyway..." >> "$LOG_FILE"
fi

# USB Stability Management - optimize power before mounting
echo "Running USB stability optimization..." >> "$LOG_FILE"
cd "$LOCAL_DIR" 2>/dev/null && {
    if [ -f "usb-stability.js" ]; then
        # Optimize USB power settings to prevent interference
        /home/openweather/.nvm/versions/node/v22.3.0/bin/node usb-stability.js power >> "$LOG_FILE" 2>&1 || {
            echo "USB power optimization failed, continuing..." >> "$LOG_FILE"
        }
        echo "USB power optimization completed" >> "$LOG_FILE"
    else
        echo "USB stability tool not found, skipping optimization" >> "$LOG_FILE"
    fi
}

# Wait for USB block devices to appear first (kernel detection)
wait_for_usb_hardware() {
    echo "Waiting for USB hardware detection..." >> "$LOG_FILE"
    for i in {1..20}; do  # 20 attempts * 2s = 40s total
        # Check if any USB block devices exist
        if ls /dev/sd[a-z] >/dev/null 2>&1; then
            echo "USB block devices detected after $((i*2)) seconds" >> "$LOG_FILE"
            lsblk | grep -E "^sd" >> "$LOG_FILE" 2>&1 || true
            return 0
        fi
        echo "Waiting for USB hardware... attempt $i/20" >> "$LOG_FILE"
        sleep 2
    done
    echo "No USB hardware detected after 40 seconds" >> "$LOG_FILE"
    return 1
}

# Wait for USB drives to mount (critical for config file access)
wait_for_usb_drives() {
    echo "Waiting for USB drives to mount..." >> "$LOG_FILE"
    
    # First wait for hardware detection
    if ! wait_for_usb_hardware; then
        echo "No USB hardware found, skipping USB mounting" >> "$LOG_FILE"
        return 1
    fi
    
    # Give udev/systemd time to process and auto-mount
    echo "Giving system time for auto-mounting..." >> "$LOG_FILE"
    sleep 10
    
    for i in {1..40}; do  # 40 attempts * 3s = 120s total (more time for slow USB devices)
        # Check if any USB drives are mounted in /media or /mnt
        if [ -d "/media" ] && [ "$(ls -A /media 2>/dev/null)" ]; then
            echo "USB drives detected in /media after $((i*3 + 10)) seconds" >> "$LOG_FILE"
            return 0
        fi
        if [ -d "/mnt" ] && [ "$(ls -A /mnt 2>/dev/null)" ]; then
            echo "USB drives detected in /mnt after $((i*3 + 10)) seconds" >> "$LOG_FILE"
            return 0
        fi
        
        # Check specifically for our expected mount point
        if [ -d "/media/openweather/O-W" ] && [ "$(ls -A /media/openweather/O-W 2>/dev/null)" ]; then
            echo "Found mounted O-W drive after $((i*3 + 10)) seconds" >> "$LOG_FILE"
            return 0
        fi
        
        # Try manual mounting attempts at different intervals
        if [ $i -eq 5 ] || [ $i -eq 15 ] || [ $i -eq 25 ]; then
            echo "Attempting manual USB mounting (attempt $((i/10 + 1)))..." >> "$LOG_FILE"
            
            # Look for USB devices by label first (more reliable)
            if command -v blkid >/dev/null 2>&1; then
                # Look for the O-W labeled partition specifically
                OW_DEVICE=$(blkid -L "O-W" 2>/dev/null || true)
                if [ -n "$OW_DEVICE" ] && [ -b "$OW_DEVICE" ]; then
                    echo "Found O-W labeled device: $OW_DEVICE" >> "$LOG_FILE"
                    MOUNT_POINT="/media/openweather/O-W"
                    
                    # Check if already mounted
                    if ! mount | grep -q "$OW_DEVICE"; then
                        # Create mount point if it doesn't exist
                        if [ ! -d "$MOUNT_POINT" ]; then
                            sudo mkdir -p "$MOUNT_POINT" >> "$LOG_FILE" 2>&1
                        fi
                        
                        # Try to mount the device
                        if sudo mount "$OW_DEVICE" "$MOUNT_POINT" >> "$LOG_FILE" 2>&1; then
                            echo "Successfully mounted $OW_DEVICE to $MOUNT_POINT" >> "$LOG_FILE"
                            # Check if config file exists
                            if [ -f "$MOUNT_POINT/ow-config.json" ]; then
                                echo "Config file found at $MOUNT_POINT" >> "$LOG_FILE"
                                return 0
                            fi
                        else
                            echo "Failed to mount $OW_DEVICE to $MOUNT_POINT" >> "$LOG_FILE"
                        fi
                    else
                        echo "$OW_DEVICE already mounted" >> "$LOG_FILE"
                    fi
                fi
            fi
            
            # Fallback: Look for USB devices that aren't mounted
            for device in /dev/sd[a-z][0-9]*; do
                if [ -b "$device" ]; then
                    # Check if this device is already mounted
                    if ! mount | grep -q "$device"; then
                        echo "Found unmounted USB device: $device" >> "$LOG_FILE"
                        
                        # Check device filesystem type first
                        FS_TYPE=$(blkid -o value -s TYPE "$device" 2>/dev/null || echo "unknown")
                        echo "Device $device filesystem: $FS_TYPE" >> "$LOG_FILE"
                        
                        # Only try to mount common filesystems
                        case "$FS_TYPE" in
                            vfat|fat32|ntfs|ext2|ext3|ext4)
                                MOUNT_POINT="/media/openweather/O-W"
                                if [ ! -d "$MOUNT_POINT" ]; then
                                    sudo mkdir -p "$MOUNT_POINT" >> "$LOG_FILE" 2>&1
                                fi
                                
                                # Try to mount the device
                                if sudo mount "$device" "$MOUNT_POINT" >> "$LOG_FILE" 2>&1; then
                                    echo "Successfully mounted $device to $MOUNT_POINT" >> "$LOG_FILE"
                                    # Check if config file exists
                                    if [ -f "$MOUNT_POINT/ow-config.json" ]; then
                                        echo "Config file found at $MOUNT_POINT" >> "$LOG_FILE"
                                        return 0
                                    else
                                        # Unmount if no config found
                                        sudo umount "$MOUNT_POINT" >> "$LOG_FILE" 2>&1 || true
                                        echo "No config file found, unmounted $device" >> "$LOG_FILE"
                                    fi
                                else
                                    echo "Failed to mount $device" >> "$LOG_FILE"
                                fi
                                ;;
                            *)
                                echo "Skipping $device with unsupported filesystem: $FS_TYPE" >> "$LOG_FILE"
                                ;;
                        esac
                    fi
                fi
            done
        fi
        
        echo "Waiting for USB drives... attempt $i/40" >> "$LOG_FILE"
        sleep 3
    done
    echo "No USB drives detected after 120 seconds, continuing anyway..." >> "$LOG_FILE"
    return 1
}

wait_for_usb_drives

# Final verification - ensure USB device stability
echo "Performing final USB device stability check..." >> "$LOG_FILE"
sleep 3

# Double-check that any mounted drives are actually accessible
if [ -d "/media/openweather/O-W" ]; then
    if [ -f "/media/openweather/O-W/ow-config.json" ]; then
        echo "Final verification: Config file confirmed at /media/openweather/O-W/" >> "$LOG_FILE"
    else
        echo "Final verification: Mount point exists but no config file found" >> "$LOG_FILE"
    fi
fi

# Debug: Show current USB device status
echo "=== USB Device Debug Info ===" >> "$LOG_FILE"
echo "Block devices:" >> "$LOG_FILE"
lsblk >> "$LOG_FILE" 2>&1
echo "Mount points:" >> "$LOG_FILE"
mount | grep -E "(sd|usb)" >> "$LOG_FILE" 2>&1
echo "Media directory contents:" >> "$LOG_FILE"
ls -la /media/ >> "$LOG_FILE" 2>&1
echo "===========================" >> "$LOG_FILE"

# Additional wait specifically for config file locations
wait_for_config_locations() {
    echo "Checking for config file locations..." >> "$LOG_FILE"
    for i in {1..20}; do  # 20 attempts * 2s = 40s total
        # Check the specific paths the config.js looks for
        if [ -d "/media/openweather/O-W" ] || [ -d "/media/openweather" ]; then
            echo "Config location found after $((i*2)) seconds" >> "$LOG_FILE"
            return 0
        fi
        # Also check for any mounted drives that might contain config
        for mount_point in /media/* /mnt/*; do
            if [ -d "$mount_point" ] && [ -f "$mount_point/ow-config.json" ]; then
                echo "Config file found at $mount_point after $((i*2)) seconds" >> "$LOG_FILE"
                return 0
            fi
        done
        echo "Waiting for config locations... attempt $i/20" >> "$LOG_FILE"
        sleep 2
    done
    echo "Config locations not found after 40 seconds, continuing anyway..." >> "$LOG_FILE"
    return 1
}

wait_for_config_locations

# Smart crontab management (add only if doesn't exist)
CRON_ENTRY="0 3 * * * sudo sync && sudo shutdown -r now"
echo "Checking crontab entry..." >> "$LOG_FILE"
if ! sudo crontab -l | grep -qF "$CRON_ENTRY"; then
    echo "Adding reboot entry to crontab..." >> "$LOG_FILE"
    (sudo crontab -l 2>/dev/null; echo "$CRON_ENTRY") | sudo crontab -
    echo "Crontab update complete." >> "$LOG_FILE"
else
    echo "Crontab entry already exists" >> "$LOG_FILE"
fi

UPDATE_FAILED=false

# Check for bypass version check file
BYPASS_FILE="/home/openweather/bypass-version-check"
if [ -f "$BYPASS_FILE" ]; then
    echo "Version check bypass file found at $BYPASS_FILE. Skipping update process." >> "$LOG_FILE"
    UPDATE_FAILED=true  # Skip the update but continue with the rest of the script
else
    echo "No bypass file found. Proceeding with version check." >> "$LOG_FILE"
fi

# Step 1: Fetch the latest release information from the GitHub API with retries (skip if bypass is active)
if [ "$UPDATE_FAILED" = false ]; then
    echo "Fetching release info from GitHub..." >> "$LOG_FILE"
    for i in {1..5}; do
        RELEASE_INFO=$(/usr/bin/curl -s "$RELEASE_API_URL")
        if [ $? -eq 0 ]; then
            break
        else
            echo "GitHub API request failed (attempt $i/5)" >> "$LOG_FILE"
            sleep 10
        fi
    done

    echo "Release Info: $RELEASE_INFO" >> "$LOG_FILE"

    # Parse the release info
    LATEST_RELEASE=$(echo "$RELEASE_INFO" | grep -oP '"tag_name":\s*"\K[^"]+')
    DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -oP '"tarball_url":\s*"\K[^"]+')

    echo "Latest release: $LATEST_RELEASE, Download URL: $DOWNLOAD_URL" >> "$LOG_FILE"

    # Check if LATEST_RELEASE or DOWNLOAD_URL are empty
    if [ -z "$LATEST_RELEASE" ] || [ -z "$DOWNLOAD_URL" ]; then
        echo "Failed to retrieve latest release or tarball URL from GitHub." >> "$LOG_FILE"
        echo "Continuing without updating." >> "$LOG_FILE"
        UPDATE_FAILED=true
    fi
else
    echo "Skipping GitHub API request due to bypass file." >> "$LOG_FILE"
fi

# Handle version.txt with backup/restore
if [ ! -f "$LOCAL_DIR/version.txt" ]; then
    echo "version.txt not found, treating as new installation." >> "$LOG_FILE"
    CURRENT_VERSION=""
else
    CURRENT_VERSION=$(cat "$LOCAL_DIR/version.txt")
    # Create backup in case update fails
    cp "$LOCAL_DIR/version.txt" /tmp/version_backup.txt
fi

if [ "$UPDATE_FAILED" = false ] && [ "$CURRENT_VERSION" != "$LATEST_RELEASE" ]; then
    echo "New release found: $LATEST_RELEASE. Updating..." >> "$LOG_FILE"

    TMP_DIR="/tmp/open_weather_update"
    mkdir -p "$TMP_DIR"

    # Step 4: Download and extract the tarball using curl -L
    echo "Downloading update package..." >> "$LOG_FILE"
    if ! /usr/bin/curl -L "$DOWNLOAD_URL" | tar xz -C "$TMP_DIR"; then
        echo "Failed to download and extract tarball" >> "$LOG_FILE"
        UPDATE_FAILED=true
    else
        # Find the extracted directory
        EXTRACTED_DIR=$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d)
        
        if [ -z "$EXTRACTED_DIR" ]; then
            echo "Failed to find extracted files" >> "$LOG_FILE"
            UPDATE_FAILED=true
        else
            # Backup important files
            [ -f "$LOCAL_DIR/.env" ] && cp "$LOCAL_DIR/.env" /tmp/.env_backup
            [ -f "$LOCAL_DIR/configPath.json" ] && cp "$LOCAL_DIR/configPath.json" /tmp/configPath_backup.json
            
            # Remove old files but preserve node_modules to save bandwidth
            if [ -d "$LOCAL_DIR" ]; then
                echo "Removing old files..." >> "$LOG_FILE"
                find "$LOCAL_DIR" -mindepth 1 -maxdepth 1 ! -name 'node_modules' -exec rm -rf {} +
                
                # Copy new files
                echo "Copying new files from $EXTRACTED_DIR" >> "$LOG_FILE"
                cp -r "$EXTRACTED_DIR"/* "$LOCAL_DIR"/
                
                # Restore important files
                [ -f /tmp/.env_backup ] && mv /tmp/.env_backup "$LOCAL_DIR/.env"
                [ -f /tmp/configPath_backup.json ] && mv /tmp/configPath_backup.json "$LOCAL_DIR/configPath.json"
            else
                echo "Directory $LOCAL_DIR does not exist" >> "$LOG_FILE"
                UPDATE_FAILED=true
            fi

            if [ "$UPDATE_FAILED" = false ]; then
                # Step 6: Install/update dependencies
                echo "Running npm install..." >> "$LOG_FILE"
                cd "$LOCAL_DIR" || {
                    echo "Failed to change directory to $LOCAL_DIR" >> "$LOG_FILE"
                    UPDATE_FAILED=true
                }
                
                if [ "$UPDATE_FAILED" = false ]; then
                    npm install --production >> "$LOG_FILE" 2>&1 || {
                        echo "npm install failed" >> "$LOG_FILE"
                        UPDATE_FAILED=true
                    }
                    
                    # Step 7: Update the current version
                    echo "$LATEST_RELEASE" > version.txt
                    echo "Update to $LATEST_RELEASE successful" >> "$LOG_FILE"
                    
                    # Step 8: Notify user and restart gracefully
                    echo "GitHub update complete, preparing to restart..." >> "$LOG_FILE"
                    
                    # Start Node.js briefly to display restart message on LCD
                    cd "$LOCAL_DIR" || exit 1
                    timeout 10s node -e "
                    try {
                        const { printLCD } = require('./lcd');
                        printLCD('Update complete!', 'Restarting...');
                        setTimeout(() => {
                            printLCD('Restart in 5s', 'Please wait...');
                        }, 2000);
                    } catch (e) {
                        console.log('LCD not available for restart message');
                    }
                    " >> "$LOG_FILE" 2>&1
                    
                    # Give user time to see the message
                    sleep 6
                    
                    # Step 9: Reboot the device gracefully
                    echo "Rebooting system after update..." >> "$LOG_FILE"
                    sudo shutdown -r +0 "System restarting after GitHub update"
                fi
            fi
        fi
    fi
    
    # Clean up temp directory
    rm -rf "$TMP_DIR"
    
    # Restore version if update failed
    if [ "$UPDATE_FAILED" = true ] && [ -f /tmp/version_backup.txt ]; then
        echo "Restoring previous version.txt" >> "$LOG_FILE"
        cp /tmp/version_backup.txt "$LOCAL_DIR/version.txt"
    fi
    rm -f /tmp/version_backup.txt
elif [ "$UPDATE_FAILED" = false ]; then
    echo "Already up to date ($CURRENT_VERSION)." >> "$LOG_FILE"
fi

# ----------------------------------------------------------------------
# Install tzupdate via pipx if needed, then run with retries
# ----------------------------------------------------------------------
echo "Ensuring pipx is installed..." >> "$LOG_FILE"
if ! command -v pipx &>/dev/null; then
    sudo apt-get update >> "$LOG_FILE" 2>&1
    sudo apt-get install -y pipx >> "$LOG_FILE" 2>&1
    pipx ensurepath >> "$LOG_FILE" 2>&1
    echo "pipx installed." >> "$LOG_FILE"
else
    echo "pipx already installed." >> "$LOG_FILE"
fi

echo "Checking tzupdate installation..." >> "$LOG_FILE"
if ! pipx list 2>/dev/null | grep -q tzupdate; then
    if pipx install tzupdate >> "$LOG_FILE" 2>&1; then
        echo "tzupdate installed via pipx." >> "$LOG_FILE"
    else
        echo "Failed to install tzupdate via pipx." >> "$LOG_FILE"
    fi
else
    echo "tzupdate already installed via pipx." >> "$LOG_FILE"
fi

echo "Running tzupdate with retries..." >> "$LOG_FILE"
for i in {1..5}; do
    if sudo -H pipx run tzupdate >> "$LOG_FILE" 2>&1; then
        echo "tzupdate succeeded on attempt $i" >> "$LOG_FILE"
        break
    else
        echo "tzupdate attempt $i failed" >> "$LOG_FILE"
        sleep 10
    fi
    if [ $i -eq 5 ]; then
        echo "All tzupdate attempts failed" >> "$LOG_FILE"
    fi
done

# Ensure dependencies are installed before launching (crucial for LCD functionality)
echo "Checking and installing dependencies..." >> "$LOG_FILE"
cd "$LOCAL_DIR" || {
    echo "Failed to change directory to $LOCAL_DIR" >> "$LOG_FILE"
    exit 1
}

# Check if node_modules exists and if critical packages are installed
if [ ! -d "node_modules" ] || [ ! -d "node_modules/raspberrypi-liquid-crystal" ]; then
    echo "Critical dependencies missing, installing..." >> "$LOG_FILE"
    npm install --production >> "$LOG_FILE" 2>&1 || {
        echo "Failed to install dependencies, attempting without --production flag..." >> "$LOG_FILE"
        npm install >> "$LOG_FILE" 2>&1 || {
            echo "CRITICAL: npm install failed completely" >> "$LOG_FILE"
            exit 1
        }
    }
    echo "Dependencies installation completed" >> "$LOG_FILE"
else
    echo "Dependencies already installed" >> "$LOG_FILE"
fi

# Continue to launch the Node.js process regardless of update success
echo "Launching Node.js application..." >> "$LOG_FILE"

# Final check that USB drives are still accessible before launching app
echo "Final check for USB accessibility before launching app..." >> "$LOG_FILE"

# Run comprehensive USB stability check before app launch
echo "Running comprehensive USB stability check..." >> "$LOG_FILE"
cd "$LOCAL_DIR" 2>/dev/null && {
    if [ -f "usb-stability.js" ]; then
        /home/openweather/.nvm/versions/node/v22.3.0/bin/node usb-stability.js check >> "$LOG_FILE" 2>&1
        USB_CHECK_RESULT=$?
        if [ $USB_CHECK_RESULT -ne 0 ]; then
            echo "WARNING: USB stability issues detected. Network may be unstable." >> "$LOG_FILE"
        else
            echo "USB stability check passed" >> "$LOG_FILE"
        fi
    else
        echo "USB stability tool not found, skipping comprehensive check" >> "$LOG_FILE"
    fi
}

for i in {1..10}; do
    # Check if the config file is actually accessible
    if [ -f "/media/openweather/O-W/ow-config.json" ]; then
        echo "Config file verified accessible at /media/openweather/O-W/ow-config.json" >> "$LOG_FILE"
        break
    elif [ -f "/media/openweather/ow-config.json" ]; then
        echo "Config file verified accessible at /media/openweather/ow-config.json" >> "$LOG_FILE"
        break
    else
        echo "Config file not yet accessible, waiting... attempt $i/10" >> "$LOG_FILE"
        # List what's actually in the media directory for debugging
        echo "Contents of /media:" >> "$LOG_FILE"
        ls -la /media >> "$LOG_FILE" 2>&1
        if [ -d "/media/openweather" ]; then
            echo "Contents of /media/openweather:" >> "$LOG_FILE"
            ls -la /media/openweather >> "$LOG_FILE" 2>&1
        fi
        if [ -d "/media/openweather/O-W" ]; then
            echo "Contents of /media/openweather/O-W:" >> "$LOG_FILE"
            ls -la /media/openweather/O-W >> "$LOG_FILE" 2>&1
        fi
        sleep 2
    fi
done

# Remove any stale configPath.json that might point to wrong location
if [ -f "$LOCAL_DIR/configPath.json" ]; then
    echo "Removing potentially stale configPath.json" >> "$LOG_FILE"
    rm -f "$LOCAL_DIR/configPath.json"
fi

cd "$LOCAL_DIR" && /home/openweather/.nvm/versions/node/v22.3.0/bin/node scheduler.js >> "$LOG_FILE" 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> "$LOG_FILE"