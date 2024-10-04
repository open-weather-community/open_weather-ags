const fs = require('fs');
const path = require('path');
const checkDiskSpace = require('check-disk-space').default;
const logger = require('./logger'); // Assuming you have a logger module
const config = require('./config'); // Assuming you have a config module

function checkDisk() {
    const mediaPath = config.saveDir;

    logger.info(`Checking disk space on ${mediaPath}...`);

    checkDiskSpace(mediaPath).then((diskSpace) => {
        let percentFree = (diskSpace.free / diskSpace.size) * 100;
        logger.info(`Disk space on ${mediaPath}: ${diskSpace.free} bytes free, or ${percentFree.toFixed(2)}%`);

        // if less than 10% free space, delete oldest 2 recordings
        if (percentFree < 10) {
            logger.info(`Less than 10% free space on ${mediaPath}. Deleting oldest 2 recordings...`);
            deleteOldestRecordings(mediaPath, 2);
        }

    }).catch((error) => {
        logger.error(`Error checking disk space: ${error.message}`);
    });
}

function deleteOldestRecordings(directory, count) {
    try {
        // Get the list of files in the media path
        const files = fs.readdirSync(directory);

        // Filter the files to only include .wav files
        const wavFiles = files.filter(file => file.endsWith('.wav'));

        // Sort the .wav files by creation time in ascending order
        wavFiles.sort((a, b) => {
            return fs.statSync(path.join(directory, a)).birthtime - fs.statSync(path.join(directory, b)).birthtime;
        });

        // Delete the oldest .wav files
        for (let i = 0; i < count && i < wavFiles.length; i++) {
            const fileToDelete = path.join(directory, wavFiles[i]);
            fs.unlinkSync(fileToDelete);
            logger.info(`Deleted file: ${fileToDelete}`);
        }
    } catch (error) {
        logger.error(`Error deleting oldest recordings: ${error.message}`);
    }
}

module.exports = {
    checkDisk,
    deleteOldestRecordings
};