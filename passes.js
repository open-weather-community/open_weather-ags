// passes.js
const fs = require('fs');
const path = require('path');
const { processPasses } = require('./tle');

async function updatePasses(config, logger) {
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

function findHighestMaxElevationPass(passes) {
    const now = new Date();
    const today = now.toISOString().split('T')[0]; // Get current date in YYYY-MM-DD format

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

function ensurePassesFileExists(passesFilePath, logger) {
    if (!fs.existsSync(passesFilePath)) {
        fs.writeFileSync(passesFilePath, '[]');
        logger.info(`Blank passes file created at ${passesFilePath}`);
    }
}

function readPassesFile(passesFilePath, logger) {
    try {
        const data = fs.readFileSync(passesFilePath, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        logger.error(`Error reading or parsing file at ${passesFilePath}: ${error.message}`);
        return [];
    }
}

module.exports = {
    updatePasses,
    findHighestMaxElevationPass,
    ensurePassesFileExists,
    readPassesFile
};
