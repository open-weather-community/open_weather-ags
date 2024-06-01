#!/bin/bash

# Export the NVM environment variables
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# Introduce a delay to allow the drive to mount
sleep 30

# Set log file path
LOG_FILE="/media/openweather/INTENSO2/log.txt"
if [ ! -d "/media/openweather/INTENSO2/" ]; then
  LOG_FILE="/home/openweather/fallback_log.txt"
fi

# Run the Node.js script in a new terminal window
/home/openweather/.nvm/versions/node/v16.13.2/bin/node /home/openweather/open_weather-ags/scheduler.js >> $LOG_FILE 2>&1 &

