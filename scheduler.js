// scheduler.js
const VERSION = '0.1e';
const fs = require('fs').promises;
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');
const checkDiskSpace = require('check-disk-space').default;
const { printLCD, clearLCD, startMarquee } = require('./lcd'); // Import LCD module
const { findConfigFile, loadConfig, saveConfig, getConfigPath } = require('./config'); // Import config module
const { checkWifiConnection } = require('./wifi');

async function main() {
    printLCD('booting up', 'groundstation');

    let config;
    try {
        config = loadConfig();
        if (!config) throw new Error('Failed to load configuration');
    } catch (error) {
        console.error(error.message);
        printLCD('config error', 'check log');
        process.exit(1);
    }

    console.log(config);
    printLCD('config loaded');

    try {
        await checkWifiConnection(config);
        printLCD('wifi', 'connected');
    } catch (error) {
        console.error(`Error checking Wi-Fi connection: ${error.message}`);
        printLCD('unable to connect', 'to WIFI');
        process.exit(1);
    }

    const logger = new Logger(config);
    logger.info('Logger loaded');
    logger.info(`as user: ${process.getuid()}`);  // Log the user ID of the process
    logger.info(`as group: ${process.getgid()}`);  // Log the group ID of the process
    logger.info(`current working directory: ${process.cwd()}`);  // Log the current working directory

    await checkDisk(config, logger);
    await updatePasses(config, logger);
    await handleMainLogic(config, logger);
}

async function checkDisk(config, logger) {
    const mediaPath = config.saveDir;
    logger.info(`Checking disk space on ${mediaPath}...`);

    try {
        const { free, size } = await checkDiskSpace(mediaPath);
        const percentFree = (free / size) * 100;
        logger.info(`Disk space on ${mediaPath}: ${free} bytes free, or ${percentFree.toFixed(2)}%`);

        if (percentFree < 10) {
            logger.info(`Less than 10% free space on ${mediaPath}. Deleting oldest 2 recordings...`);

            const files = await fs.readdir(mediaPath);
            const wavFiles = files.filter(file => file.endsWith('.wav'));

            const sortedWavFiles = await sortFilesByCreationTime(wavFiles, mediaPath);

            for (let i = 0; i < 2 && i < sortedWavFiles.length; i++) {
                const fileToDelete = path.join(mediaPath, sortedWavFiles[i]);
                await fs.unlink(fileToDelete);
                logger.info(`Deleted file: ${fileToDelete}`);
            }
        }
    } catch (error) {
        logger.error(`Error checking disk space: ${error.message}`);
    }
}

async function sortFilesByCreationTime(files, directory) {
    const fileStats = await Promise.all(files.map(async file => {
        const filePath = path.join(directory, file);
        const stats = await fs.stat(filePath);
        return { file, birthtime: stats.birthtime };
    }));

    return fileStats.sort((a, b) => a.birthtime - b.birthtime).map(stat => stat.file);
}

async function updatePasses(config, logger) {
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    await fs.writeFile(passesFilePath, '[]');
    logger.info(`Cleared passes file at ${passesFilePath}`);

    await processPasses(config, logger);

    const logFilePath = path.resolve(config.saveDir, config.logFile);
    const logFileContent = await fs.readFile(logFilePath, 'utf8');
    const logFileLines = logFileContent.split('\n');
    if (logFileLines.length > 100) {
        const recentLogs = logFileLines.slice(-100).join('\n');
        await fs.writeFile(logFilePath, recentLogs);
    }
}

async function handleMainLogic(config, logger) {
    printLCD('updating', 'passes...');
    await updatePasses(config, logger);
    printLCD('passes', 'updated');

    const passesFilePath = path.resolve(config.saveDir, config.passesFile);

    await ensurePassesFileExists(passesFilePath);

    const passes = await readPassesFile(passesFilePath);

    const highestMaxElevationPass = findHighestMaxElevationPass(passes);

    logger.log("Highest max elevation pass of the day:");
    logger.log(JSON.stringify(highestMaxElevationPass));

    printLCD('ground station', 'ready!' + ' v' + VERSION);

    if (highestMaxElevationPass) {
        const now = new Date();
        const recordTime = new Date(`${highestMaxElevationPass.date} ${highestMaxElevationPass.time}`);
        const delay = recordTime - now;

        if (delay > 0) {
            setTimeout(() => {
                handleRecording(highestMaxElevationPass, now, passesFilePath, passes, config, logger);
            }, delay);

            logger.info(`Scheduling recording for ${highestMaxElevationPass.satellite} at ${highestMaxElevationPass.date} ${highestMaxElevationPass.time} for ${highestMaxElevationPass.duration} minutes...`);
        } else {
            logger.log('The highest max elevation pass time is in the past, skipping recording.');
        }
    } else {
        logger.log('No valid passes found to record.');
    }
}

async function handleRecording(item, now, passesFilePath, jsonData, config, logger) {
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

    await fs.writeFile(passesFilePath, JSON.stringify(jsonData, null, 2));
}

async function ensurePassesFileExists(passesFilePath) {
    try {
        await fs.access(passesFilePath);
    } catch (error) {
        await fs.writeFile(passesFilePath, '[]');
        logger.info(`Blank passes file created at ${passesFilePath}`);
    }
}

async function readPassesFile(passesFilePath) {
    try {
        const data = await fs.readFile(passesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error reading or parsing file at ${passesFilePath}: ${error.message}`);
        return [];
    }
}

function findHighestMaxElevationPass(passes) {
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    const validPasses = passes.filter(pass => {
        const passDate = new Date(`${pass.date} ${pass.time}`);
        const passDay = passDate.toISOString().split('T')[0];
        return passDay === today && passDate > now;
    });

    return validPasses.reduce((maxPass, currentPass) => {
        const maxElevation = parseFloat(maxPass.maxElevation) || 0;
        const currentElevation = parseFloat(currentPass.maxElevation);
        return currentElevation > maxElevation ? currentPass : maxPass;
    }, {});
}

main().catch(err => {
    console.error(`Error in main execution: ${err.message}`);
    printLCD('unexpected error', 'check log');
    process.exit(1);
});