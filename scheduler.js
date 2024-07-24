// scheduler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');
const checkDiskSpace = require('check-disk-space').default;

const mediaPath = '/mnt/o-w/';
let config = null;

const { printLCD, clearLCD, startMarquee } = require('./lcd'); // Import LCD module
printLCD('booting up', 'groundstation');

// Function to recursively find the config file in a directory and its subdirectories
function findConfigFile(dir) {
    // Check if the directory exists
    if (!fs.existsSync(dir)) {
        logger.error(`Directory not found while finding config: ${dir}`);
        return null;
    }

    // Read all files and directories in the current directory
    const files = fs.readdirSync(dir);
    for (const file of files) {
        // Construct the full path for each file
        const filePath = path.join(dir, file);
        // Get the file or directory stats
        const stat = fs.statSync(filePath);

        // If it is a directory, recursively search within this directory
        if (stat.isDirectory()) {
            const result = findConfigFile(filePath);
            if (result) {
                return result;  // Return the path of the found config file
            }
        } else if (file === 'config.json') {
            return filePath;  // Return the path if the config.json file is found
        }
    }
    return null;  // Return null if no config file is found in this directory and its subdirectories
}

// Function to load the configuration from the config file
function loadConfig() {
    // Check if the 'configPath.json' file exists to store the path of the found config file
    if (!fs.existsSync('configPath.json')) {
        console.log(`No configPath.json found, searching for config file in ${mediaPath}...`);

        // Search for 'config.json' in the media path
        const configPath = findConfigFile(mediaPath);
        console.log(`found configFile on external media, setting configPath to ${configPath}`);
        // printLCD('Config found @', `${configPath}`);

        if (!configPath) {
            // If no config file is found, copy the default configuration to the media path
            console.log('No config file found in /mnt/... duplicating default config.json to /mnt/');
            fs.copyFileSync('default.config.json', `${mediaPath}config.json`);
            // Read and return the newly copied config file
            return JSON.parse(fs.readFileSync(`${mediaPath}config.json`, 'utf8'));
        } else {
            // Save the path of the found config file in 'configPath.json'
            fs.writeFileSync('configPath.json', JSON.stringify({ configPath }));
            // Read and return the config file
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } else {
        // If 'configPath.json' exists, read the path of the config file from it
        const { configPath } = JSON.parse(fs.readFileSync('configPath.json', 'utf8'));
        // Check if the config file exists at the specified path
        if (fs.existsSync(configPath)) {
            // Read and return the config file
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            // Log an error if the config file path is invalid
            console.log(`Config file at path ${configPath} not found!`);
            return null;
        }
    }
}

// Load the configuration
config = loadConfig();
if (!config) {
    throw new Error("Config could not be loaded. Exiting...");
} else {
    printLCD('ground station', 'ready!');
}

// Initialize the logger with the configuration
const logger = new Logger(config);
logger.info('Logger loaded');
logger.info(`as user: ${process.getuid()}`);  // Log the user ID of the process
logger.info(`as group: ${process.getgid()}`);  // Log the group ID of the process
logger.info(`current working directory: ${process.cwd()}`);  // Log the current working directory

// Schedule a cron job to run every day at 4 AM
cron.schedule('0 4 * * *', () => {
    // request update from server, get json file back'
    if (false) {    // don't do this for now
        fetch('https://example.com/data')
            .then(response => {
                // Check if the response is ok (status in the range 200-299)
                if (!response.ok) {
                    throw new Error('Network response was not ok');
                }
                return response.json(); // Parse JSON from the response body
            })
            .then(data => {
                console.log(data); // Handle the data from the response
                // if we receive any of the keys from config.json, update the config.json file
                for (const key in data) {
                    if (data.hasOwnProperty(key) && config.hasOwnProperty(key)) {
                        config[key] = data[key];
                    }
                }
                // save the updated config.json file
                fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
            })
            .catch(error => {
                console.error('There has been a problem with your fetch operation:', error);
            });
    }
});

// check disk space of mediaPath
function checkDisk() {

    // logger.info(`Checking disk space on ${mediaPath}...`);

    checkDiskSpace(mediaPath).then((diskSpace) => {
        let percentFree = (diskSpace.free / diskSpace.size) * 100;
        // logger.info(`Disk space on ${mediaPath}: ${diskSpace.free} bytes free, or ${percentFree.toFixed(2)}%`);

        // if less than 10% free space, delete oldest 2 recordings
        if (percentFree < 10) {
            logger.info(`Less than 10% free space on ${mediaPath}. Deleting oldest 2 recordings...`);

            // Get the list of files in the media path
            const files = fs.readdirSync(mediaPath);

            // Filter the files to only include .wav files
            const wavFiles = files.filter(file => file.endsWith('.wav'));

            // Sort the .wav files by creation time in ascending order
            wavFiles.sort((a, b) => {
                return fs.statSync(path.join(mediaPath, a)).birthtime - fs.statSync(path.join(mediaPath, b)).birthtime;
            });

            // Delete the oldest 2 .wav files
            for (let i = 0; i < 2 && i < wavFiles.length; i++) {
                const fileToDelete = path.join(mediaPath, wavFiles[i]);
                fs.unlinkSync(fileToDelete);
                logger.info(`Deleted file: ${fileToDelete}`);
            }
        }

    }).catch((error) => {
        logger.error(`Error checking disk space: ${error.message}`);
    });

}

// cron job to check disk space every 6 hours
cron.schedule('0 */6 * * *', () => {
    checkDisk();
});

// every 3 days... maintenance on log and passes files
cron.schedule('0 0 */3 * *', () => {

    // totally clear passes.json
    const passesFilePath = path.resolve(__dirname, config.passesFile);
    fs.writeFileSync(passesFilePath, '[]');
    logger.info(`Blank passes file created at ${passesFilePath}`);

    // get TLE data
    processPasses(config, logger);

    // clear all but the most recent 100 lines of log.txt
    const logFilePath = path.resolve(__dirname, config.logFile);
    const logFile = fs.readFileSync(logFilePath, 'utf8').split('\n');
    const logFileLength = logFile.length;
    if (logFileLength > 100) {
        fs.writeFileSync(logFilePath, logFile.slice(logFileLength - 100).join('\n'));
    }

});

// Schedule a cron job to run every minute
cron.schedule('* * * * *', () => {

    printLCD('waiting for', `satellites...`);

    // Define an asynchronous function to process data
    async function processData() {
        // Check if recording is already in progress
        if (isRecording()) {
            logger.info('Already recording, skipping this cron cycle...');
            return;  // Skip the cron job if recording is in progress
        }

        try {
            // Resolve the full path to the passes file based on the config
            const passesFilePath = path.resolve(__dirname, config.passesFile);

            // If the passes file does not exist, create it with an empty array
            if (!fs.existsSync(passesFilePath)) {
                fs.writeFileSync(passesFilePath, '[]');
                logger.info(`Blank passes file created at ${passesFilePath}`);
                return;
            }

            // Define paths for the backup and temporary files
            const backupFilePath = `${passesFilePath}.bak`;
            const tempFilePath = `${passesFilePath}.tmp`;

            let data;
            try {
                // Read the data from the passes file
                data = fs.readFileSync(passesFilePath, 'utf8');
            } catch (error) {
                // Log an error if reading the file fails
                logger.error(`Error reading file at ${passesFilePath}: ${error}`);
                return;
            }

            // If the file is empty, process passes data
            if (!data || data.trim() === '') {
                logger.error('No passes found. Retrieving TLE data...');
                await processPasses(config, logger);
                return;
            }

            let jsonData;
            try {
                // Parse the data from the passes file as JSON
                jsonData = JSON.parse(data);
            } catch (parseError) {
                // Log an error if parsing the JSON data fails
                logger.error(`Error parsing JSON data: ${parseError.message}`);
                return;
            }

            // Check if there are any entries in the JSON data
            const hasEntries = Array.isArray(jsonData) ? jsonData.length > 0 : Object.keys(jsonData).length > 0;

            if (!hasEntries) {
                // If no entries, retrieve TLE data
                logger.info('No passes found. Running TLE data...');
                await processPasses(config, logger);
                return;
            }

            const now = new Date();

            jsonData.forEach(item => {
                // Parse the record time and calculate the end time
                const recordTime = new Date(`${item.date} ${item.time}`);
                const endRecordTime = new Date(recordTime.getTime() + item.duration * 60000);

                // Check if the current time is within the recording time range and it has not been recorded yet
                if (now >= recordTime && now <= endRecordTime && !item.recorded) {
                    if (isRecording()) {
                        logger.info('Already recording from within the forEach, returning...');
                        return;
                    }

                    // if the elevation is lower than minElevation, skip recording
                    if (item.avgElevation < config.minElevation) {
                        logger.info(`Skipping recording of ${item.satellite} due to low elevation (${item.avgElevation}°)`);

                        // delete entry
                        jsonData = jsonData.filter(pass => pass !== item);
                        fs.writeFileSync(passesFilePath, JSON.stringify(jsonData, null, 2));

                        return;
                    }

                    let newDuration = Math.floor((endRecordTime - now) / 60000);

                    // Start recording
                    logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`);
                    startRecording(item.frequency, recordTime, item.satellite, newDuration, config, logger);

                    // printLCD(`Recording`, `${item.satellite}`);

                    const marqueeInterval = startMarquee(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`, 500);

                    // Stop the marquee after 10 seconds for demonstration purposes
                    setTimeout(() => {
                        clearInterval(marqueeInterval);
                        clearLCD();
                        printLCD('done recording');
                    }, newDuration * 60000);

                    item.recorded = true;  // Mark the item as recorded
                }
            });

            // Backup the current passes file and update it with the new data
            fs.copyFileSync(passesFilePath, backupFilePath);
            fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));
            fs.renameSync(tempFilePath, passesFilePath);

        } catch (err) {
            // Log any errors that occur during the data processing
            logger.error(`Error processing data: ${err.message}`);
        }
    }

    // Execute the data processing function
    processData();
});

