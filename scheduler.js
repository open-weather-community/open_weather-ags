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
const { initializeNetwork, startNetworkMonitoring, displayNetworkStatus, getNetworkStatus } = require('./network');
const { checkDisk, deleteOldestRecordings } = require('./disk');
const {
    updatePasses,
    findTopMaxElevationPasses,
    ensurePassesFileExists,
    readPassesFile,
} = require('./passes');
const axios = require('axios');
const { spawn } = require('child_process');

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

            // Try to provide more helpful information
            setTimeout(() => {
                printLCD('need ow-config', 'json on USB');
            }, 3000);

            setTimeout(async () => {
                printLCD('will restart', 'automatically');
                // Wait a bit more then restart automatically
                setTimeout(async () => {
                    await gracefulRestart('missing config file', 15);
                }, 3000);
            }, 6000);

            // Keep the process alive long enough for the restart sequence
            await new Promise(() => { }); // Wait indefinitely
        }
        console.log('Configuration loaded successfully' + (config._backup_created ? ' (restored from backup)' : '') + (config._using_default ? ' (using default settings - WiFi may not work!)' : ''));

        // Show warning if using default config
        if (config._using_default) {
            printLCD('default config!', 'create ow-config');
            setTimeout(() => {
                printLCD('WiFi may not', 'work properly');
            }, 3000);
            await new Promise(resolve => setTimeout(resolve, 6000));
        }
    } catch (error) {
        console.error(`Error loading configuration: ${error.message}`);

        // More specific error handling
        if (error.message.includes('No configuration available') ||
            error.message.includes('ow-config.json')) {
            printLCD('config missing!', 'check USB drive');
            setTimeout(() => {
                printLCD('need ow-config', 'json file');
            }, 3000);
            setTimeout(async () => {
                await gracefulRestart('config file missing', 12);
            }, 6000);
        } else if (error.message.includes('JSON') || error.message.includes('parse')) {
            printLCD('config error', 'invalid JSON');
            setTimeout(() => {
                printLCD('check syntax', 'in config file');
            }, 3000);
            setTimeout(async () => {
                await gracefulRestart('config JSON syntax error', 12);
            }, 6000);
        } else {
            printLCD('config error', 'check USB/log');
            setTimeout(async () => {
                await gracefulRestart('config loading error', 10);
            }, 3000);
        }

        // Give more specific error messages on LCD
        if (error.message.includes('No configuration available')) {
            setTimeout(() => {
                printLCD('USB drive may', 'need config file');
            }, 6000);
        }

        // Keep the process alive long enough for the restart sequence
        await new Promise(() => { }); // Wait indefinitely
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

    // Initialize network connections with ethernet priority
    console.log('Initializing network connections...');
    logger.info('Starting network initialization with ethernet priority');

    const networkResult = await initializeNetwork(config);

    if (networkResult.success) {
        console.log(`Network initialized: ${networkResult.connection} connection active`);
        logger.info(`Network connected via ${networkResult.connection} with IP ${networkResult.ip}`);

        // Start network monitoring (reduced frequency since status is now in ready message)
        const networkMonitor = startNetworkMonitoring(10); // Update every 10 minutes for monitoring

        // Store monitor reference for cleanup if needed
        process.networkMonitor = networkMonitor;
    } else {
        console.error(`Network initialization failed: ${networkResult.error}`);
        logger.error(`Network initialization failed: ${networkResult.error} - system will continue without network`);
        printLCD('No Network', 'Continuing...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Check disk space and delete oldest recordings if necessary
    checkDisk(logger, config.saveDir, deleteOldestRecordings);

    // Only attempt to update passes if network is available
    if (networkResult.success) {
        printLCD('updating', 'passes...');
        try {
            // Add timeout protection for pass update
            const passUpdateTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Pass update timeout after 3 minutes')), 180000);
            });

            const passUpdatePromise = updatePasses(config, logger);

            await Promise.race([passUpdatePromise, passUpdateTimeout]);

            printLCD('passes', 'updated');
            logger.info('Satellite passes updated successfully');
        } catch (error) {
            logger.error('Failed to update passes: ' + error.message);

            if (error.message.includes('timeout')) {
                printLCD('pass update', 'timed out');
                logger.error('Pass update timed out - this may indicate network or system issues');
            } else if (error.message.includes('EAI_AGAIN') || error.message.includes('ENOTFOUND')) {
                printLCD('DNS failed', 'using cache');
                logger.error('DNS resolution failed during pass update - will use cached data');
            } else {
                printLCD('pass update', 'failed');
                logger.error('Pass update failed with error: ' + error.message);
            }

            // Continue with existing passes if update fails
            logger.info('Continuing with existing satellite pass data');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }
    } else {
        logger.info('Network not available, skipping pass update - will use existing passes');
        printLCD('no network', 'using cached data');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

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

    // Get network status and display ready message with connection type
    try {
        const networkStatus = await getNetworkStatus();
        let connectionType = 'no net';

        if (networkStatus.primary === 'ethernet') {
            connectionType = 'ethernet';
        } else if (networkStatus.primary === 'wifi') {
            connectionType = 'wifi';
        }

        // Format line 2: version left-aligned, network type right-aligned (16 chars total)
        const versionText = `v${VERSION}`;
        const line2 = (versionText + ' '.repeat(16 - versionText.length - connectionType.length) + connectionType).slice(0, 16);

        printLCD('AGS Ready!', line2);
        console.log(`Ground station ready with ${connectionType} connection`);
    } catch (error) {
        console.log('Could not determine network status for ready message');
        const versionText = `v${VERSION}`;
        const line2 = (versionText + ' '.repeat(16 - versionText.length - 6) + 'no net').slice(0, 16);
        printLCD('AGS Ready!', line2);
    }

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

        // Provide helpful information based on network status
        if (!networkResult.success) {
            logger.info('Network is unavailable and no cached passes found. The system will retry at the next daily reboot.');
            printLCD('No passes found', 'Network needed');
            setTimeout(() => {
                printLCD('Will retry at', 'next reboot');
            }, 5000);
        } else {
            logger.info('Network is available but no passes found for today. Check satellite schedule.');
            printLCD('No passes found', 'Check schedule');
        }
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

// Function to perform graceful restart with user notification
async function gracefulRestart(reason, delay = 10) {
    try {
        console.log(`Initiating graceful restart: ${reason}`);
        printLCD('System restart', 'required...');

        // Give user time to see first message
        setTimeout(() => {
            printLCD('Restarting in', `${delay} seconds...`);
        }, 2000);

        // Countdown
        let countdown = delay - 5;
        const countdownInterval = setInterval(() => {
            if (countdown > 0) {
                printLCD('Restarting in', `${countdown} seconds...`);
                countdown--;
            } else {
                clearInterval(countdownInterval);
                printLCD('Restarting now', 'Please wait...');
            }
        }, 1000);

        // Wait for the delay, then restart
        setTimeout(() => {
            console.log(`Restarting system: ${reason}`);
            const shutdown = spawn('sudo', ['shutdown', '-r', '+0', `AGS restart: ${reason}`], {
                detached: true,
                stdio: 'ignore'
            });
            shutdown.unref();
        }, delay * 1000);

    } catch (error) {
        console.error(`Error during graceful restart: ${error.message}`);
        // Fallback to immediate restart
        spawn('sudo', ['reboot'], { detached: true, stdio: 'ignore' }).unref();
    }
}

main().catch(async (err) => {
    console.error(`Error in main execution: ${err.message}`);
    if (logger) logger.error(`Error in main execution: ${err.message}`);

    // Handle specific error patterns from production data
    if (err.message.includes('EAI_AGAIN') || err.message.includes('ENOTFOUND')) {
        console.error('DNS resolution failure detected - likely network configuration issue');
        printLCD('DNS Error', 'Check network');
        if (logger) logger.error('DNS resolution failure - this often indicates network interface or configuration issues');

        // Try to restart with network reset after delay
        setTimeout(async () => {
            await gracefulRestart('DNS resolution failure', 30);
        }, 5000);
    } else if (err.message.includes('timeout')) {
        console.error('Timeout error detected during startup');
        printLCD('Startup timeout', 'Restarting...');
        if (logger) logger.error('Startup timeout - system may be overloaded or have hardware issues');

        setTimeout(async () => {
            await gracefulRestart('startup timeout', 20);
        }, 3000);
    } else if (err.message.includes('Network unavailable')) {
        console.error('Network unavailable during startup');
        printLCD('No Network', 'Will retry...');
        if (logger) logger.error('Network unavailable during startup - will attempt restart');

        setTimeout(async () => {
            await gracefulRestart('network unavailable', 60);
        }, 5000);
    } else {
        // Generic error handling
        console.error('Unexpected error during startup');
        printLCD('Startup Error', 'Check logs');
        if (logger) logger.error('Unexpected startup error: ' + err.stack);

        setTimeout(async () => {
            await gracefulRestart('unexpected startup error', 30);
        }, 5000);
    }
});
