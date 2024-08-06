#!/bin/bash

# Log to cronlog.txt that it is booting up
echo "Booting up at $(date)" >> /home/openweather/cronlog.txt

# Export the NVM environment variables
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# Introduce a delay to allow the drive to mount
sleep 30

# Change the current working directory to the directory where the scheduler.js file is located
#echo "Changing directory to /home/openweather/open_weather-ags" >> /home/openweather/cronlog.txt
cd /home/openweather/open_weather-ags 2>> /home/openweather/cronlog.txt

# Fetch latest changes from Git repository
git fetch origin >> /home/openweather/cronlog.txt 2>&1

# Reset the local branch to match the remote branch
git reset --hard origin/main >> /home/openweather/cronlog.txt 2>&1

# Launch the Node.js process using the node executable in the current working directory
/home/openweather/.nvm/versions/node/v22.3.0/bin/node scheduler.js >> /home/openweather/cronlog.txt 2>&1

# Log the completion of the script
echo "Script completed at $(date)" >> /home/openweather/cronlog.txt
