#!/bin/bash

# write to log.txt that it is booting up
echo "Booting up" >> /home/openweather/cronlog.txt

# Export the NVM environment variables
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && . "$NVM_DIR/bash_completion" # This loads nvm bash_completion

# Introduce a delay to allow the drive to mount
sleep 30

# Change the current working directory to the directory where the scheduler.js file is located
cd /home/openweather/open_weather-ags

# Launch the Node.js process using the node executable in the current working directory
/home/openweather/.nvm/versions/node/v16.13.2/bin/node scheduler.js