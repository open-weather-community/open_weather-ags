// scheduler.js
const VERSION = '0.1e';
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');
const checkDiskSpace = require('check-disk-space').default;
const { printLCD, clearLCD, startMarquee } = require('./lcd');
const { findConfigFile, loadConfig, saveConfig, getConfigPath } = require('./config');
const { checkWifiConnection } = require('./wifi');

printLCD('booting up', 'groundstation');

// Load configuration
let config = loadConfig();
console.log(config);

if (!config) {
    console.log('Failed to load configuration');
    printLCD('config error', 'check log');
    process.exit(1);
}

printLCD('config loaded');

// Check Wi-Fi connection
checkWifiConnection(config);
printLCD('wifi', 'connected');

// Initialize logger
const logger = new Logger(config);
logger.info('Logger loaded');
logger.info(`as user: ${process.getuid()}`);
logger.info(`as group: ${process.getgid()}`);
logger.info(`current working directory: ${process.cwd()}`);

// Function to check disk space and delete old recordings if necessary
function checkDisk() {
    const mediaPath = config.saveDir;

    logger.info(`Checking disk space on ${mediaPath}...`);
    checkDiskSpace(mediaPath).then((diskSpace) => {
        const percentFree = (diskSpace.free / diskSpace.size) * 100;
        logger.info(`Disk space on ${mediaPath}: ${diskSpace.free} bytes free, or ${percentFree.toFixed(2)}%`);

        // If less than 10% free space, delete oldest 2 recordings
        if (percentFree < 10) {
            logger.info(`Less than 10% free space on ${mediaPath}. Deleting oldest 2 recordings...`);
            const files = fs.readdirSync(mediaPath).filter(file => file.endsWith('.wav'));
            files.sort((a, b) => fs.statSync(path.join(mediaPath, a)).birthtime - fs.statSync(path.join(mediaPath, b)).birthtime);

            // Delete the oldest 2 .wav files
            files.slice(0, 2).forEach(file => {
                const fileToDelete = path.join(mediaPath, file);
                fs.unlinkSync(fileToDelete);
                logger.info(`Deleted file: ${fileToDelete}`);
            });
        }
    }).catch(error => logger.error(`Error checking disk space: ${error.message}`));
}

checkDisk();

// Function to update passes and clear logs
async function updatePasses() {
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    fs.writeFileSync(passesFilePath, '[]');
    logger.info(`Cleared passes file at ${passesFilePath}`);

    await processPasses(config, logger);

    // Clear all but the last 100 lines of the log file
    const logFilePath = path.resolve(config.saveDir, config.logFile);
    const logData = fs.readFileSync(logFilePath, 'utf8').split('\n');
    if (logData.length > 100) {
        fs.writeFileSync(logFilePath, logData.slice(-100).join('\n'));
    }
}

async function main() {
    printLCD('updating', 'passes...');
    await updatePasses();
    printLCD('passes', 'updated');

    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    ensurePassesFileExists(passesFilePath);

    const passes = readPassesFile(passesFilePath);
    const highestMaxElevationPass = findHighestMaxElevationPass(passes);

    logger.log("Highest max elevation pass of the day:");
    logger.log(JSON.stringify(highestMaxElevationPass));

    printLCD('ground station', `ready! v${VERSION}`);

    if (highestMaxElevationPass) {
        const now = new Date();
        const recordTime = new Date(`${highestMaxElevationPass.date} ${highestMaxElevationPass.time}`);
        const delay = recordTime - now;

        if (delay > 0) {
            setTimeout(() => handleRecording(highestMaxElevationPass, now, passesFilePath, passes), delay);
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
    logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`);

    startRecording(item.frequency, recordTime, item.satellite, item.duration, config, logger);

    const marqueeInterval = startMarquee(`Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`, 500);
    setTimeout(() => {
        clearInterval(marqueeInterval);
        clearLCD();
        printLCD('done recording');
    }, item.duration * 60000);

    item.recorded = true;
    fs.writeFileSync(passesFilePath, JSON.stringify(jsonData, null, 2));
}

// Utility function to ensure passes file exists
function ensurePassesFileExists(passesFilePath) {
    if (!fs.existsSync(passesFilePath)) {
        fs.writeFileSync(passesFilePath, '[]');
        logger.info(`Blank passes file created at ${passesFilePath}`);
    }
}

// Utility function to read and parse the passes file
function readPassesFile(passesFilePath) {
    try {
        const data = fs.readFileSync(passesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error reading or parsing file at ${passesFilePath}: ${error.message}`);
        return [];
    }
}

// Find the pass with the highest elevation for today
function findHighestMaxElevationPass(passes) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const validPasses = passes.filter(pass => {
        const passDate = new Date(`${pass.date} ${pass.time}`);
        return passDate.toISOString().split('T')[0] === today && passDate > now;
    });

    return validPasses.reduce((maxPass, currentPass) => {
        const maxElevation = parseFloat(maxPass.maxElevation) || 0;
        const currentElevation = parseFloat(currentPass.maxElevation);
        return currentElevation > maxElevation ? currentPass : maxPass;
    }, {});
}

// Execute the main function
main().catch(err => logger.error(`Error in main execution: ${err.message}`));
