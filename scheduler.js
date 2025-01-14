// scheduler.js
// this is the main app which schedules recordings based on the passes data
// to do:
// passes stuff can be moved back to local storage

const packageJson = require('./package.json');
const VERSION = packageJson.version;
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { printLCD, clearLCD, startMarquee } = require('./lcd');
const { findConfigFile, loadConfig, saveConfig, getConfigPath } = require('./config');
const { checkWifiConnection } = require('./wifi');
const { checkDisk, deleteOldestRecordings } = require('./disk');
const {
    updatePasses,
    findTopMaxElevationPasses,
    ensurePassesFileExists,
    readPassesFile,
} = require('./passes');
const axios = require('axios');

let logger;
let config;

async function main() {
    printLCD('booting up', 'groundstation');

    let configPath;

    try {
        configPath = getConfigPath();
        console.log(`Config file path: ${configPath}`);
        config = loadConfig();
        if (!config) throw new Error('Failed to load configuration');
    } catch (error) {
        console.error(`Error loading configuration: ${error.message}`);
        printLCD('config error', 'check log');
        process.exit(1);
    }

    // print config without password and auth_token
    const obscuredConfig = { ...config };
    obscuredConfig.wifiPassword = '********';
    obscuredConfig.auth_token = '********';
    console.log(obscuredConfig);

    // indicate on LCD that config is loaded
    printLCD('config loaded');

    // initialize the logger with the configuration
    logger = new Logger(config);
    logger.info('Logger loaded');
    logger.info(`as user: ${process.getuid()}`); // Log the user ID of the process
    logger.info(`as group: ${process.getgid()}`); // Log the group ID of the process
    logger.info(`current working directory: ${process.cwd()}`); // Log the current working directory

    // check Wi-Fi connection
    printLCD('checking', 'Wi-Fi...');
    try {
        await checkWifiConnection(config);
        printLCD('Wi-Fi', 'connected');
    } catch (error) {
        console.error(`Error checking Wi-Fi connection: ${error.message}`);
        logger.error(`Error checking Wi-Fi connection: ${error.message}`);
        printLCD('Wi-Fi error', 'try restart');
        process.exit(1);
    }

    // Check disk space and delete oldest recordings if necessary
    checkDisk(logger, config.saveDir, deleteOldestRecordings);

    printLCD('updating', 'passes...');
    await updatePasses(config, logger);
    printLCD('passes', 'updated');

    const passesFilePath = path.resolve(config.saveDir, config.passesFile);

    // Ensure the passes file exists
    ensurePassesFileExists(passesFilePath, logger);

    // Read and parse the passes file
    const passes = readPassesFile(passesFilePath, logger);

    // Get the number of passes to record from config, default to 1
    const numberOfPassesToRecord = config.numberOfPassesPerDay ?? 1;

    // Find the top X max elevation passes
    const topMaxElevationPasses = findTopMaxElevationPasses(passes, numberOfPassesToRecord);

    logger.info(`Top ${numberOfPassesToRecord} max elevation passes of the day:`);
    logger.info(JSON.stringify(topMaxElevationPasses, null, 2));

    printLCD('ground station', `ready! :D v${VERSION}`);

    if (topMaxElevationPasses && topMaxElevationPasses.length > 0) {
        for (const pass of topMaxElevationPasses) {
            const now = new Date();

            const recordTime = new Date(`${pass.date} ${pass.time}`);
            const delay = recordTime - now;

            if (delay > 0) {
                setTimeout(async () => {
                    await handleRecording(
                        pass,
                        now,
                        passesFilePath,
                        passes
                    );
                }, delay);

                logger.info(
                    `Scheduling recording for ${pass.satellite} at ${pass.date} ${pass.time} for ${pass.duration} minutes...`
                );

                // print the next recording time on the LCD, as a 24-hour time string
                const recordTimeString = recordTime.toLocaleTimeString('en-GB', { hour12: false });

                setTimeout(() => {
                    printLCD(
                        'Next recording',
                        `${pass.satellite} at ${recordTimeString}`
                    );
                }, 60000);

            } else {
                logger.info(
                    `The pass time for ${pass.satellite} is in the past, skipping recording.`
                );
            }
        }
    } else {
        logger.info('No valid passes found to record.');
    }
}

async function handleRecording(item, now, passesFilePath, jsonData) {
    const recordTime = new Date(`${item.date} ${item.time}`);
    logger.info(
        `Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`
    );

    startRecording(item.frequency, recordTime, item.satellite, item.duration, config, logger);

    const marqueeInterval = startMarquee(
        `Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...`,
        500
    );
    setTimeout(() => {
        clearInterval(marqueeInterval);
        clearLCD();
        printLCD('done recording');
    }, item.duration * 60000);

    item.recorded = true;

    // Write the updated jsonData to the passes file
    fs.writeFileSync(passesFilePath, JSON.stringify(jsonData, null, 2));
}


main().catch((err) => {
    console.error(`Error in main execution: ${err.message}`);
    if (logger) logger.error(`Error in main execution: ${err.message}`);
});
