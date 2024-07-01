const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
let config = null;
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle.js');
const Logger = require('./logger');
// const { load } = require('npm');



// find config file by searching for config.json in /mnt/
const mediaPath = '/mnt/o-w/';

function findConfigFile(dir) {
    if (!fs.existsSync(dir)) {
        logger.error(`Directory not found white finding config: ${dir}`);
        return null;
    }

    const files = fs.readdirSync(dir);

    for (const file of files) {
        const filePath = path.join(dir, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            const result = findConfigFile(filePath);
            if (result) {
                return result;
            }
        } else if (file === 'config.json') {
            return filePath;
        }
    }

    return null;
}

// if there is nothing in configPath.json, find the config file in the mount path
// and save the path to configPath.json
if (!fs.existsSync('configPath.json')) {

    // logger.info(`No configPath.json found, searching for config file in ${mediaPath}...`);

    const configPath = findConfigFile(mediaPath);

    if (!configPath) {
        // logger.error('No config file found in /mnt/... duplicating default config.json to /mnt/');
        fs.copyFileSync('default.config.json', `${mediaPath}config.json`);
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    } else {
        // logger.info(`Found config file at ${configPath}`);
        // save config path to configPath.json in this working directory
        fs.writeFileSync('configPath.json', JSON.stringify({ configPath }));
        // load the config file to config without using require
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        // logger.info('Config loaded from ' + configPath);

    }
} else {
    logger.info('Found configPath.json, skipping search for config file');
}

logger = new Logger(config);

// log boot
logger.info('logger loaded =================================================');
logger.info("as user: " + process.getuid());
logger.info("as group: " + process.getgid());
logger.info("current working directory: " + process.cwd());


// schedule reset for 4AM daily
cron.schedule('0 4 * * *', () => {
    // fetchApiData();
});

// schedule the task to run every minute
cron.schedule('* * * * *', () => {
    async function processData() {

        if (isRecording()) {
            logger.info('Already recording, skipping this cron cycle...');
            return;
        }

        try {
            const passesFilePath = path.resolve(__dirname, config.passesFile);
            const backupFilePath = `${passesFilePath}.bak`;
            const tempFilePath = `${passesFilePath}.tmp`;

            let data;
            try {
                data = fs.readFileSync(passesFilePath, 'utf8');
            } catch (error) {
                logger.error(`Error reading file at ${passesFilePath}: ` + error);
            }
            //logger.info(data);

            // check if the file content is empty
            if (!data || data.trim() === '') {
                logger.error('No passes found. Retrieving TLE data...');
                await processPasses(config);
                return;
            }

            // Parse the JSON data
            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                logger.error('Error parsing JSON data: ' + parseError.message);
                return;
            }

            // check if the parsed JSON data has entries
            const hasEntries = Array.isArray(jsonData) ? jsonData.length > 0 : Object.keys(jsonData).length > 0;

            if (!hasEntries) {
                logger.info('No passes found. Running TLE data...');
                await processPasses();
                return;
            }

            // get the current time
            const now = new Date();

            // check if it's time to start recording
            jsonData.forEach(item => {

                const recordTime = new Date(`${item.date} ${item.time}`);

                // take into account the duration
                const endRecordTime = new Date(recordTime.getTime() + item.duration * 60000);

                //logger.info(`got entry ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes... and now is ${now} and record time is ${recordTime} and end record time is ${endRecordTime}`);

                if (now >= recordTime && now <= endRecordTime && !item.recorded) {

                    //logger.info("found one");

                    if (isRecording()) {
                        logger.info('Already recording from within the forEach, returning...');
                        return;
                    }

                    let newDuration = Math.floor((endRecordTime - now) / 60000);

                    logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`);
                    startRecording(item.frequency, recordTime, item.satellite, newDuration, config);
                    // mark item as recorded
                    item.recorded = true;
                }
            });

            // backup the existing file before writing new data
            fs.copyFileSync(passesFilePath, backupFilePath);

            // write updated JSON data to a temporary file
            fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));

            // rename the temporary file to the original file
            fs.renameSync(tempFilePath, passesFilePath);

        } catch (err) {
            logger.error('Error processing data: ' + err.message);
        }
    }

    processData();
});
