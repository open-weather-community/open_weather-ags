/* passes.js
    This module contains functions to update passes, find the highest max elevation pass of the day,
    and find the top X max elevation passes of the day.
*/

const fs = require('fs');
const path = require('path');
const { processPasses } = require('./tle');

// Function to update passes and clean up log file
async function updatePasses(config, logger) {
    const passesFilePath = path.resolve(config.saveDir, config.passesFile);
    fs.writeFileSync(passesFilePath, '[]');
    logger.info(`Cleared passes file at ${passesFilePath}`);

    // Get TLE data and process passes
    await processPasses(config, logger);

    // Clean log file to the most recent 100 lines
    const logFilePath = path.resolve(config.saveDir, config.logFile);
    const logFile = fs.readFileSync(logFilePath, 'utf8').split('\n');
    const logFileLength = logFile.length;

    if (logFileLength > 100) {
        fs.writeFileSync(logFilePath, logFile.slice(logFileLength - 100).join('\n'));
    }
}

// Function to find the highest max elevation pass of the day
function findHighestMaxElevationPass(passes) {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA'); // YYYY-MM-DD format in local time

    const validPasses = passes.filter(pass => {
        const passDate = new Date(`${pass.date} ${pass.time}`);

        // Ensure the date is valid before proceeding
        if (isNaN(passDate.getTime())) {
            console.error("Invalid Date detected for pass:", pass);
            return false;
        }

        const passDay = passDate.toLocaleDateString('en-CA');

        return passDay === today && passDate > now;
    });

    return validPasses.reduce((maxPass, currentPass) => {
        const maxElevation = parseFloat(maxPass.maxElevation) || 0;
        const currentElevation = parseFloat(currentPass.maxElevation);
        return currentElevation > maxElevation ? currentPass : maxPass;
    }, {});
}



function findTopMaxElevationPasses(passes, topCount = 1) {
    const now = new Date();
    const today = now.toLocaleDateString('en-CA'); // Local time YYYY-MM-DD

    const validPasses = passes.filter(pass => {
        // Create the date using a correct format
        const passDate = new Date(`${pass.date} ${pass.time}`);

        // Ensure the date is valid before proceeding
        if (isNaN(passDate.getTime())) {
            console.error("Invalid Date detected for pass:", pass);
            return false;
        }

        const passDay = passDate.toLocaleDateString('en-CA');

        // only satellite passes that occur later today (after the current time) are considered valid
        return passDay === today && passDate > now;
    });

    return validPasses
        .sort((a, b) => parseFloat(b.maxElevation) - parseFloat(a.maxElevation))
        .slice(0, topCount);
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
    findTopMaxElevationPasses,
    ensurePassesFileExists,
    readPassesFile,
};
