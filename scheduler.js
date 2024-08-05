// scheduler.js
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');
const checkDiskSpace = require('check-disk-space').default;
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

// request update from server, get json file back'
// add this later if necessary
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

// check disk space of mediaPath
function checkDisk() {
    const mediaPath = config.saveDir;

    logger.info(`Checking disk space on ${mediaPath}...`);

    checkDiskSpace(mediaPath).then((diskSpace) => {
        let percentFree = (diskSpace.free / diskSpace.size) * 100;
        logger.info(`Disk space on ${mediaPath}: ${diskSpace.free} bytes free, or ${percentFree.toFixed(2)}%`);

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

checkDisk();

async function updatePasses() {
    // totally clear passes.json
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    fs.writeFileSync(passesFilePath, '[]');
    logger.info(`Cleared passes file at ${passesFilePath}`);

    // get TLE data
    await processPasses(config, logger);

    // clear all but the most recent 100 lines of log.txt
    const logFilePath = path.resolve(config.saveDir, config.logFile);
    const logFile = fs.readFileSync(logFilePath, 'utf8').split('\n');
    const logFileLength = logFile.length;
    if (logFileLength > 100) {
        fs.writeFileSync(logFilePath, logFile.slice(logFileLength - 100).join('\n'));
    }
}

async function main() {
    printLCD('updating', 'passes...');
    await updatePasses();
    printLCD('passes', 'updated');

    function findHighestMaxElevationPass(passes) {
        const now = new Date();
        const today = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

        const validPasses = passes.filter(pass => {
            const passDate = new Date(`${pass.date} ${pass.time}`);
            const passDay = passDate.toISOString().split('T')[0];
            return passDay === today && passDate > now;
        });

        return validPasses.reduce((maxPass, currentPass) => {
            return currentPass.maxElevation > (maxPass.maxElevation || 0) ? currentPass : maxPass;
        }, {});
    }


    // find the highest max elevation pass
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);

    // ensure the passes file exists
    ensurePassesFileExists(passesFilePath);

    // read it and parse it
    const passes = readPassesFile(passesFilePath);

    // find the highest max elevation pass
    const highestMaxElevationPass = findHighestMaxElevationPass(passes);

    logger.log("Highest max elevation pass of the day:");
    logger.log(JSON.stringify(highestMaxElevationPass));

    printLCD('will record at', highestMaxElevationPass.time);

    // record the highest max elevation pass at the correct time
    if (highestMaxElevationPass) {
        const now = new Date();

        // combine highestMaxElevationPass.date and highestMaxElevationPass.time to get the recordTime
        const recordTime = new Date(`${highestMaxElevationPass.date} ${highestMaxElevationPass.time}`);
        const delay = recordTime - now;

        if (delay > 0) {
            setTimeout(() => {
                handleRecording(highestMaxElevationPass, now, passesFilePath, passes);
            }, delay);

            // const recordTime = new Date(`${highestMaxElevationPass.date} ${highestMaxElevationPass.time}`);
            // const endRecordTime = new Date(recordTime.getTime() + highestMaxElevationPass.duration * 60000);
            // const newDuration = Math.floor((endRecordTime - recordTime) / 60000);
            logger.info(`Scheduling recording for ${highestMaxElevationPass.satellite} at ${highestMaxElevationPass.date} ${highestMaxElevationPass.time} for ${highestMaxElevationPass.duration} minutes...`);

        } else {
            logger.log('The highest max elevation pass time is in the past, skipping recording.');
        }
    } else {
        logger.log('No valid passes found to record.');
    }
}

async function handleRecording(item, now, passesFilePath, jsonData) {

    const recordTime = new Date(`${item.date} ${item.time}`);
    // const endRecordTime = new Date(recordTime.getTime() + item.duration * 60000);
    // const newDuration = Math.floor((endRecordTime - now) / 60000);

    logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`);

    startRecording(item.frequency, recordTime, item.satellite, item.duration, config, logger);

    const marqueeInterval = startMarquee(`Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`, 500);
    setTimeout(() => {
        clearInterval(marqueeInterval);
        clearLCD();
        printLCD('done recording');
    }, newDuration * 60000);

    item.recorded = true;  // Mark the item as recorded

    // write the updated jsonData to the passes file
    fs.writeFileSync(passesFilePath, JSON.stringify(jsonData, null, 2));
}

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
        return [];
    }
}

// Execute the main function
main().catch(err => logger.error(`Error in main execution: ${err.message}`));
