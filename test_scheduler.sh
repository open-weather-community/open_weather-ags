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

# Give the system time to connect to the network
sleep 20

# Step 1: Fetch the latest release information from the GitHub API
RELEASE_INFO=$(/usr/bin/curl -s $RELEASE_API_URL)
echo "Release Info: $RELEASE_INFO" >> /home/openweather/cronlog.txt

# Parse the release info
LATEST_RELEASE=$(echo $RELEASE_INFO | grep -oP '"tag_name":\s*"\K[^"]+')
DOWNLOAD_URL=$(echo $RELEASE_INFO | grep -oP '"tarball_url":\s*"\K[^"]+')

echo "Latest release: $LATEST_RELEASE, Download URL: $DOWNLOAD_URL" >> /home/openweather/cronlog.txt

# Check if LATEST_RELEASE or DOWNLOAD_URL are empty
if [ -z "$LATEST_RELEASE" ] || [ -z "$DOWNLOAD_URL" ]; then
    echo "Failed to retrieve the latest release or tarball URL from the GitHub API." >> /home/openweather/cronlog.txt
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

    TMP_DIR="/tmp/open_weather_update"
    
    mkdir -p $TMP_DIR

    # Step 4: Download and extract the tarball using curl -L
    /usr/bin/curl -L $DOWNLOAD_URL | tar xz -C $TMP_DIR || { echo "Failed to download and extract the tarball" >> /home/openweather/cronlog.txt; exit 1; }

    # Find the extracted directory (it will have a hash in the name)
    EXTRACTED_DIR=$(find $TMP_DIR -mindepth 1 -maxdepth 1 -type d)

    # Step 5: Remove old files but preserve important configurations (like .env and configPath.json)
    if [ -d "$LOCAL_DIR" ]; then
        # Move the .env file to a safe location temporarily
        if [ -f "$LOCAL_DIR/.env" ]; then
            mv "$LOCAL_DIR/.env" /tmp/.env_backup
        fi

        # Move the configPath.json file to a safe location temporarily
        if [ -f "$LOCAL_DIR/configPath.json" ]; then
            mv "$LOCAL_DIR/configPath.json" /tmp/configPath_backup.json
        fi

        # Remove all files except for .env and configPath.json
        rm -rf "$LOCAL_DIR"/*

        # Copy the contents from the extracted directory to $LOCAL_DIR
        cp -r $EXTRACTED_DIR/* $LOCAL_DIR/

        # Restore the .env file
        if [ -f /tmp/.env_backup ]; then
            mv /tmp/.env_backup "$LOCAL_DIR/.env"
        fi

        # Restore the configPath.json file
        if [ -f /tmp/configPath_backup.json ]; then
            mv /tmp/configPath_backup.json "$LOCAL_DIR/configPath.json"
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
/home/openweather/.nvm/versions/node/v22.3.0/bin/node $LOCAL_DIR/scheduler.js >> /home/openweather/cronlog.txt 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> /home/openweather/cronlog.txt