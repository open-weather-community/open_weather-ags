#!/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
# Source NVM and set up Node.js environment
export NVM_DIR="/home/openweather/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
nvm use 22.3.0

REPO="https://github.com/prismspecs/open_weather-ags"
LOCAL_DIR="/home/openweather/open_weather-ags"
RELEASE_API_URL="https://api.github.com/repos/prismspecs/open_weather-ags/releases/latest"
LOG_FILE="/home/openweather/cronlog.txt"
LOG_MAX_LINES=1000
LOG_LINES_TO_DELETE=800

# Acquire a lock to prevent concurrent executions
exec 200>/home/openweather/openweather_startup.lockfile
flock -n 200 || exit 1

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

# Give the system time to connect to the network
sleep 20

UPDATE_FAILED=false

# Step 1: Fetch the latest release information from the GitHub API
RELEASE_INFO=$(/usr/bin/curl -s "$RELEASE_API_URL")
echo "Release Info: $RELEASE_INFO" >> "$LOG_FILE"

# Parse the release info
LATEST_RELEASE=$(echo "$RELEASE_INFO" | grep -oP '"tag_name":\s*"\K[^"]+')
DOWNLOAD_URL=$(echo "$RELEASE_INFO" | grep -oP '"tarball_url":\s*"\K[^"]+')

echo "Latest release: $LATEST_RELEASE, Download URL: $DOWNLOAD_URL" >> "$LOG_FILE"

# Check if LATEST_RELEASE or DOWNLOAD_URL are empty
if [ -z "$LATEST_RELEASE" ] || [ -z "$DOWNLOAD_URL" ]; then
    echo "Failed to retrieve the latest release or tarball URL from the GitHub API." >> "$LOG_FILE"
    echo "Continuing without updating." >> "$LOG_FILE"
    UPDATE_FAILED=true
fi

if [ "$UPDATE_FAILED" = false ]; then
    # Step 2: Check if the current version matches the latest release
    if [ ! -f "$LOCAL_DIR/version.txt" ]; then
        echo "version.txt not found, treating as a new installation." >> "$LOG_FILE"
        CURRENT_VERSION=""
    else
        CURRENT_VERSION=$(cat "$LOCAL_DIR/version.txt")
    fi

    if [ "$CURRENT_VERSION" != "$LATEST_RELEASE" ]; then
        echo "New release found: $LATEST_RELEASE. Updating..." >> "$LOG_FILE"

        TMP_DIR="/tmp/open_weather_update"
        mkdir -p "$TMP_DIR"

        # Step 4: Download and extract the tarball using curl -L
        if ! /usr/bin/curl -L "$DOWNLOAD_URL" | tar xz -C "$TMP_DIR"; then
            echo "Failed to download and extract the tarball" >> "$LOG_FILE"
            echo "Continuing without updating." >> "$LOG_FILE"
            UPDATE_FAILED=true
        else
            # Find the extracted directory (it will have a hash in the name)
            EXTRACTED_DIR=$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d)

            # Step 5: Remove old files but preserve important configurations
            if [ -d "$LOCAL_DIR" ]; then
                # Backup important files
                [ -f "$LOCAL_DIR/.env" ] && mv "$LOCAL_DIR/.env" /tmp/.env_backup
                [ -f "$LOCAL_DIR/configPath.json" ] && mv "$LOCAL_DIR/configPath.json" /tmp/configPath_backup.json

                # Remove old files
                rm -rf "$LOCAL_DIR"/*

                # Copy new files
                cp -r "$EXTRACTED_DIR"/* "$LOCAL_DIR/"

                # Restore important files
                [ -f /tmp/.env_backup ] && mv /tmp/.env_backup "$LOCAL_DIR/.env"
                [ -f /tmp/configPath_backup.json ] && mv /tmp/configPath_backup.json "$LOCAL_DIR/configPath.json"
            else
                echo "Directory $LOCAL_DIR does not exist" >> "$LOG_FILE"
                UPDATE_FAILED=true
            fi

            if [ "$UPDATE_FAILED" = false ]; then
                # Step 6: Install/update dependencies
                cd "$LOCAL_DIR" || { echo "Failed to change directory to $LOCAL_DIR" >> "$LOG_FILE"; UPDATE_FAILED=true; }
                if ! npm install --production; then
                    echo "npm install failed" >> "$LOG_FILE"
                    UPDATE_FAILED=true
                else
                    # Step 7: Update the current version
                    echo "$LATEST_RELEASE" > version.txt

                    # Step 8: Clean up
                    rm -rf "$TMP_DIR"

                    # Step 9: Reboot the device
                    sudo reboot
                fi
            fi
        fi
    else
        echo "Already up to date." >> "$LOG_FILE"
    fi
fi

# Continue to launch the Node.js process regardless of update success
echo "Launching Node.js application..." >> "$LOG_FILE"
/home/openweather/.nvm/versions/node/v22.3.0/bin/node "$LOCAL_DIR/scheduler.js" >> "$LOG_FILE" 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> "$LOG_FILE"
