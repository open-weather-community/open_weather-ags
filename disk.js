// disk.js
const fs = require('fs');
const path = require('path');
const checkDiskSpace = require('check-disk-space').default;

function checkDisk(logger, mediaPath, deleteOldestRecordings) {
    logger.info(`Checking disk space on ${mediaPath}...`);

    checkDiskSpace(mediaPath).then((diskSpace) => {
        let percentFree = (diskSpace.free / diskSpace.size) * 100;
        logger.info(`Disk space on ${mediaPath}: ${diskSpace.free} bytes free, or ${percentFree.toFixed(2)}%`);

        // if less than 10% free space, delete oldest recordings
        if (percentFree < 10) {
            logger.info(`Less than 10% free space on ${mediaPath}. Deleting oldest 2 recordings...`);
            deleteOldestRecordings(mediaPath, 2, logger);
        }

    }).catch((error) => {
        logger.error(`Error checking disk space: ${error.message}`);
    });
}

function deleteOldestRecordings(directory, count, logger) {
    try {
        const files = fs.readdirSync(directory).filter(file => file.endsWith('.wav'));

        // Sort .wav files by creation time in ascending order
        files.sort((a, b) => {
            return fs.statSync(path.join(directory, a)).birthtime - fs.statSync(path.join(directory, b)).birthtime;
        });

        // Delete the oldest recordings
        files.slice(0, count).forEach(file => {
            const filePath = path.join(directory, file);
            fs.unlinkSync(filePath);
            logger.info(`Deleted file: ${filePath}`);
        });
    } catch (error) {
        logger.error(`Error deleting oldest recordings: ${error.message}`);
    }
}

module.exports = { checkDisk, deleteOldestRecordings };
