/*

The scheduler is the main app for the project. It is responsible for scheduling the recording of satellite passes based on the TLE data and configuration settings. It also handles other tasks such as checking disk space, updating the configuration, and connecting to Wi-Fi.

to do:
+ add passes.json to usb
+ separate finding config file stuff into a separate module
+ separate wifi checking and connecting into a separate module
+ add more LCD feedback

*/

// scheduler.js
const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');
const checkDiskSpace = require('check-disk-space').default;
const { exec } = require('child_process');  // for wifi-checking
const { printLCD, clearLCD, startMarquee } = require('./lcd'); // Import LCD module
const { findConfigFile, loadConfig, saveConfig, getConfigPath } = require('./config'); // Import config module
const { checkWifiConnection } = require('./wifi');


printLCD('booting up', 'groundstation');

let config = loadConfig();

// print config
console.log(config);

if (!config) {
    console.log('Failed to load configuration');
    printLCD('config error', 'check log');
    process.exit(1);
}

// print the config path dir to the LCD
printLCD('config loaded');

// Check Wi-Fi connection
checkWifiConnection(config);

printLCD('wifi', 'connected');

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
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
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

function findHighestMaxElevationPass(passes) {
    return passes.reduce((maxPass, currentPass) => {
        return currentPass.maxElevation > (maxPass.maxElevation || 0) ? currentPass : maxPass;
    }, {});
}

// find the highest max elevation pass
const passesFilePath = path.resolve(config.saveDir, config.passesFile);
// conver tot json
const passes = JSON.parse(fs.readFileSync(passesFilePath, 'utf8'));
const highestMaxElevationPass = findHighestMaxElevationPass(passes);
console.log(highestMaxElevationPass);

// Function to create an empty passes file if it doesn't exist
function ensurePassesFileExists(passesFilePath) {
    if (!fs.existsSync(passesFilePath)) {
        fs.writeFileSync(passesFilePath, '[]');
        logger.info(`Blank passes file created at ${passesFilePath}`);
    }
}

// Function to read and parse the passes file
function readPassesFile(passesFilePath) {
    try {
        const data = fs.readFileSync(passesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error reading or parsing file at ${passesFilePath}: ${error.message}`);
        return null;
    }
}

// Function to handle the recording of passes
async function handleRecording(item, now, passesFilePath, jsonData) {
    const recordTime = new Date(`${item.date} ${item.time}`);
    const endRecordTime = new Date(recordTime.getTime() + item.duration * 60000);

    if (now >= recordTime && now <= endRecordTime && !item.recorded) {
        if (isRecording()) {
            logger.info('Already recording from within the forEach, returning...');
            return;
        }

        if (item.maxElevation < config.minElevation) {
            logger.info(`Skipping recording of ${item.satellite} due to low elevation (${item.maxElevation}°)`);
            jsonData = jsonData.filter(pass => pass !== item);
            fs.writeFileSync(passesFilePath, JSON.stringify(jsonData, null, 2));
            return;
        }

        const newDuration = Math.floor((endRecordTime - now) / 60000);
        logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`);
        startRecording(item.frequency, recordTime, item.satellite, newDuration, config, logger);

        const marqueeInterval = startMarquee(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`, 500);
        setTimeout(() => {
            clearInterval(marqueeInterval);
            clearLCD();
            printLCD('done recording');
        }, newDuration * 60000);

        item.recorded = true;  // Mark the item as recorded
    }
}

// Function to process passes and manage file backups
async function processData() {
    if (isRecording()) {
        logger.info('Already recording, skipping this cron cycle...');
        return;
    }

    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    ensurePassesFileExists(passesFilePath);

    let jsonData = readPassesFile(passesFilePath);
    if (jsonData === null) {
        logger.error('Failed to read passes file. Retrieving TLE data...');
        await processPasses(config, logger);
        return;
    }

    if (jsonData.length === 0) {
        logger.info('No passes found. Retrieving TLE data...');
        await processPasses(config, logger);
        return;
    }

    const now = new Date();
    for (const item of jsonData) {
        await handleRecording(item, now, passesFilePath, jsonData);
    }

    const backupFilePath = `${passesFilePath}.bak`;
    const tempFilePath = `${passesFilePath}.tmp`;
    fs.copyFileSync(passesFilePath, backupFilePath);
    fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));
    fs.renameSync(tempFilePath, passesFilePath);
}

// Schedule the cron job to run every minute
cron.schedule('* * * * *', () => {
    printLCD('chillin 4', 'satellites...');
    processData().catch(err => logger.error(`Error processing data: ${err.message}`));
});
