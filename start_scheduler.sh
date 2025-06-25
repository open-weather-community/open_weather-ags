#!/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

# Source NVM and set up Node.js environment
export NVM_DIR="/home/openweather/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22.3.0

LOCAL_DIR="/home/openweather/open_weather-ags"
RELEASE_API_URL="https://api.github.com/repos/open-weather-community/open_weather-ags/releases/latest"
LOG_FILE="/home/openweather/cronlog.txt"
LOG_MAX_LINES=1000
LOG_LINES_TO_DELETE=800

# Acquire a lock to prevent concurrent executions
exec 200>/home/openweather/openweather_startup.lockfile
flock -n 200 || exit 1
trap "flock -u 200" EXIT

# Log to cronlog.txt that it is booting up
echo "Booting up at $(date)" >> "$LOG_FILE"

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

# Wait for USB drives to mount (critical for config file access)
wait_for_usb_drives() {
    echo "Waiting for USB drives to mount..." >> "$LOG_FILE"
    for i in {1..30}; do  # 30 attempts * 3s = 90s total
        # Check if any USB drives are mounted in /media or /mnt
        if [ -d "/media" ] && [ "$(ls -A /media 2>/dev/null)" ]; then
            echo "USB drives detected in /media after $((i*3)) seconds" >> "$LOG_FILE"
            return 0
        fi
        if [ -d "/mnt" ] && [ "$(ls -A /mnt 2>/dev/null)" ]; then
            echo "USB drives detected in /mnt after $((i*3)) seconds" >> "$LOG_FILE"
            return 0
        fi
        echo "Waiting for USB drives... attempt $i/30" >> "$LOG_FILE"
        sleep 3
    done
    echo "No USB drives detected after 90 seconds, continuing anyway..." >> "$LOG_FILE"
    return 1
}

wait_for_usb_drives

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