#!/bin/bash

# Log to cronlog.txt that it is booting up
echo "Booting up at $(date)" >> /home/openweather/cronlog.txt

# Export the NVM environment variables
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# Log environment variables for debugging
env >> /home/openweather/cronlog.txt

# Introduce a delay to allow the drive to mount
sleep 30

# Change the current working directory to the directory where the scheduler.js file is located
echo "Changing directory to /home/openweather/open_weather-ags" >> /home/openweather/cronlog.txt
cd /home/openweather/open_weather-ags 2>> /home/openweather/cronlog.txt
cd_status=$?
if [ $cd_status -ne 0 ]; then
    echo "Failed to change directory. Exit code: $cd_status" >> /home/openweather/cronlog.txt
    exit $cd_status
fi

# Log the current working directory for debugging
echo "Current working directory after cd: $(pwd)" >> /home/openweather/cronlog.txt

# Launch the Node.js process using the node executable in the current working directory
/home/openweather/.nvm/versions/node/v16.13.2/bin/node scheduler.js >> /home/openweather/cronlog.txt 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> /home/openweather/cronlog.txt
