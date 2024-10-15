#!/bin/bash

# Acquire a lock to prevent concurrent executions
exec 200>/var/lock/openweather_startup.lockfile
flock -n 200 || exit 1

# Log to cronlog.txt that it is booting up
echo "Booting up at $(date)" >> /home/openweather/cronlog.txt

# Check if cronlog.txt has more than 1000 lines
LOG_FILE="/home/openweather/cronlog.txt"
MAX_LINES=1000
LINES_TO_DELETE=800

LINE_COUNT=$(wc -l < "$LOG_FILE")

if [ "$LINE_COUNT" -gt "$MAX_LINES" ]; then
    # Delete the first 800 lines
    sed -i "1,${LINES_TO_DELETE}d" "$LOG_FILE"
fi

# Reset the local time
echo "Resetting local time at $(date)" >> /home/openweather/cronlog.txt
sudo timedatectl set-ntp true
sudo timedatectl set-timezone "UTC"


# Export the NVM environment variables
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# Introduce a delay to allow the drive to mount
sleep 30

# Change the current working directory to the directory where the scheduler.js file is located
cd /home/openweather/open_weather-ags 2>> /home/openweather/cronlog.txt
if [ $? -ne 0 ]; then
    echo "Failed to change directory to /home/openweather/open_weather-ags" >> /home/openweather/cronlog.txt
    exit 1
fi

# Fetch latest changes from Git repository
# Reset the local branch to match the remote branch
git fetch origin main >> /home/openweather/cronlog.txt 2>&1
git reset --hard origin/main >> /home/openweather/cronlog.txt 2>&1
git clean -fdx >> /home/openweather/cronlog.txt 2>&1

# Launch the Node.js process using the node executable in the current working directory
/home/openweather/.nvm/versions/node/v22.3.0/bin/node scheduler.js >> /home/openweather/cronlog.txt 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> /home/openweather/cronlog.txt
