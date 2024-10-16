#!/bin/bash

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
echo "Booting up at $(date)" >> /home/openweather/cronlog.txt

# Check if cronlog.txt has more than 1000 lines

# make sure the log file exists
if [ ! -f "$LOG_FILE" ]; then
    touch "$LOG_FILE"
fi

LINE_COUNT=$(wc -l < "$LOG_FILE")

if [ "$LINE_COUNT" -gt "$LOG_MAX_LINES" ]; then
    echo "Truncating log file. Deleting first $LOG_LINES_TO_DELETE lines." >> $LOG_FILE
    sed -i "1,${LOG_LINES_TO_DELETE}d" "$LOG_FILE" || echo "Failed to truncate log file" >> $LOG_FILE
fi

# Reset the local time
echo "Setting ntp true and timezone to UTC at $(date)" >> /home/openweather/cronlog.txt
timedatectl set-ntp true
timedatectl set-timezone "UTC"

# Step 1: Fetch the latest release information from the GitHub API
RELEASE_INFO=$(curl -s $RELEASE_API_URL)
LATEST_RELEASE=$(echo $RELEASE_INFO | grep "tag_name" | cut -d '"' -f 4)

if [ -z "$LATEST_RELEASE" ]; then
    echo "Failed to retrieve the latest release from the GitHub API." >> /home/openweather/cronlog.txt
    exit 1
fi

# Step 2: Check if the current version matches the latest release
if [ ! -f "$LOCAL_DIR/version.txt" ]; then
    echo "version.txt not found, treating as a new installation." >> /home/openweather/cronlog.txt
    CURRENT_VERSION=""
else
    CURRENT_VERSION=$(cat $LOCAL_DIR/version.txt)
fi

if [ "$CURRENT_VERSION" != "$LATEST_RELEASE" ]; then
    echo "New release found: $LATEST_RELEASE. Updating..."

     # Step 3: Extract the tarball download URL from the API response
    DOWNLOAD_URL=$(echo $RELEASE_INFO | grep "tarball_url" | cut -d '"' -f 4)

    TMP_DIR="/tmp/open_weather_update"
    
    mkdir -p $TMP_DIR

    # Step 4: Download and extract the tarball
    wget -qO- $DOWNLOAD_URL | tar xz -C $TMP_DIR || { echo "Failed to download and extract the tarball" >> /home/openweather/cronlog.txt; exit 1; }

    # Step 5: Remove old files but preserve important configurations (like .env)
    if [ -d "$LOCAL_DIR" ]; then
        # Move the .env file to a safe location temporarily
        if [ -f "$LOCAL_DIR/.env" ]; then
            mv "$LOCAL_DIR/.env" /tmp/.env_backup
        fi

        # Remove all files except for .env
        rm -rf "$LOCAL_DIR"/*

        # Restore the .env file
        if [ -f /tmp/.env_backup ]; then
            mv /tmp/.env_backup "$LOCAL_DIR/.env"
        fi
    else
        echo "Directory $LOCAL_DIR does not exist" >> /home/openweather/cronlog.txt
        exit 1
    fi

    # Step 6: Install/update dependencies
    cd $LOCAL_DIR
    npm install --production || { echo "npm install failed" >> /home/openweather/cronlog.txt; exit 1; }

    # Step 7: Update the current version
    echo $LATEST_RELEASE > version.txt

    # Step 8: Clean up
    rm -rf $TMP_DIR

    # Step 9: Reboot the device
    sudo reboot
else
    echo "Already up to date."
fi

# Launch the Node.js process using the node executable in the current working directory
/home/openweather/.nvm/versions/node/v22.3.0/bin/node scheduler.js >> /home/openweather/cronlog.txt 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> /home/openweather/cronlog.txt