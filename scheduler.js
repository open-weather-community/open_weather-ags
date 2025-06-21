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
        if (!config) {
            console.error('Failed to load configuration: No config file found and no backup available');
            printLCD('config missing!', 'check USB drive');
            throw new Error('No configuration available - please ensure ow-config.json exists on USB drive');
        }
        console.log('Configuration loaded successfully' + (config._backup_created ? ' (restored from backup)' : ''));
    } catch (error) {
        console.error(`Error loading configuration: ${error.message}`);
        printLCD('config error', 'check USB/log');

        // Give more specific error messages on LCD
        if (error.message.includes('No configuration available')) {
            setTimeout(() => {
                printLCD('USB drive may', 'need config file');
            }, 3000);
        }

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

    // Allow system to settle after config load
    await new Promise(resolve => setTimeout(resolve, 5000));

    // check Wi-Fi connection with retry logic
    printLCD('checking', 'Wi-Fi...');
    let wifiConnected = false;
    let wifiRetryCount = 0;
    const maxWifiRetries = 3;

    while (!wifiConnected && wifiRetryCount < maxWifiRetries) {
        try {
            wifiRetryCount++;
            console.log(`Wi-Fi connection attempt ${wifiRetryCount}/${maxWifiRetries}`);
            await checkWifiConnection(config);
            wifiConnected = true;
            printLCD('Wi-Fi', 'connected');
            console.log('Wi-Fi connection successful');
        } catch (error) {
            console.error(`Wi-Fi connection attempt ${wifiRetryCount} failed: ${error.message}`);
            if (logger) logger.error(`Wi-Fi connection attempt ${wifiRetryCount} failed: ${error.message}`);

            if (wifiRetryCount < maxWifiRetries) {
                console.log(`Retrying Wi-Fi connection in 10 seconds...`);
                printLCD('Wi-Fi retry', `attempt ${wifiRetryCount + 1}/${maxWifiRetries}`);
                await new Promise(resolve => setTimeout(resolve, 10000));
            } else {
                console.error('All Wi-Fi connection attempts failed');
                printLCD('Wi-Fi failed', 'check config');
                // Don't exit immediately, log the error and continue
                if (logger) logger.error('All Wi-Fi connection attempts failed - system will continue without network');

                // Wait a bit more and try one last time
                console.log('Final Wi-Fi attempt in 15 seconds...');
                printLCD('Final Wi-Fi', 'attempt...');
                await new Promise(resolve => setTimeout(resolve, 15000));

                try {
                    await checkWifiConnection(config);
                    wifiConnected = true;
                    printLCD('Wi-Fi', 'connected');
                    console.log('Final Wi-Fi attempt successful');
                } catch (finalError) {
                    console.error(`Final Wi-Fi attempt failed: ${finalError.message}`);
                    printLCD('Wi-Fi failed', 'continuing...');
                    // Continue without network - system may recover later
                    await new Promise(resolve => setTimeout(resolve, 5000));
                }
            }
        }
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

            // 1) Check if pass time is near midnight
            if (willOverlapReboot(recordTime)) {
                logger.info(
                    `Skipping pass due to reboot overlap: ${pass.satellite} starts at ${pass.date} ${pass.time} for ${pass.duration}m.`
                );
                continue;
            }

            // 2) If pass time is in the future, schedule it
            if (delay > 0) {
                setTimeout(async () => {
                    await handleRecording(pass, now, passesFilePath, passes);
                }, delay);

                logger.info(
                    `Scheduling recording for ${pass.satellite} at ${pass.date} ${pass.time} for ${pass.duration} minutes...`
                );

                // Print the next recording time on LCD in 24-hour format
                const recordTimeString = recordTime.toLocaleTimeString('en-GB', { hour12: false });
                setTimeout(() => {
                    printLCD('Next recording', `${pass.satellite} at ${recordTimeString}`);
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

/**
 * Returns true if the pass [passStart, passEnd) overlaps the 2:50-3:10 window.
 */
function willOverlapReboot(passStart, durationMinutes) {
    // Convert pass times to timestamps
    const passStartMs = passStart.getTime();
    const passEndMs = passStartMs + durationMinutes * 60_000; // convert min -> ms

    // Build the daily buffer window for the same date as passStart
    const year = passStart.getFullYear();
    const month = passStart.getMonth();
    const day = passStart.getDate();

    // 2:50 AM
    const bufferStart = new Date(year, month, day, 2, 50).getTime();

    // 3:10 AM
    const bufferEnd = new Date(year, month, day, 3, 10).getTime();

    // Overlap if passStart < bufferEnd and passEnd > bufferStart
    return passStartMs < bufferEnd && passEndMs > bufferStart;
}

main().catch((err) => {
    console.error(`Error in main execution: ${err.message}`);
    if (logger) logger.error(`Error in main execution: ${err.message}`);
});
