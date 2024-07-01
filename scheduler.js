const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const Logger = require('./logger');
const { isRecording, startRecording } = require('./recorder');
const { processPasses } = require('./tle');

const mediaPath = '/mnt/o-w/';
let config = null;

function findConfigFile(dir) {
    if (!fs.existsSync(dir)) {
        logger.error(`Directory not found while finding config: ${dir}`);
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

function loadConfig() {
    if (!fs.existsSync('configPath.json')) {
        console.log(`No configPath.json found, searching for config file in ${mediaPath}...`);

        const configPath = findConfigFile(mediaPath);
        console.log(`found configFile on external media, setting configPath to ${configPath}`);

        if (!configPath) {
            console.log('No config file found in /mnt/... duplicating default config.json to /mnt/');
            fs.copyFileSync('default.config.json', `${mediaPath}config.json`);
            return JSON.parse(fs.readFileSync(`${mediaPath}config.json`, 'utf8'));
        } else {
            fs.writeFileSync('configPath.json', JSON.stringify({ configPath }));
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
    } else {
        const { configPath } = JSON.parse(fs.readFileSync('configPath.json', 'utf8'));
        if (fs.existsSync(configPath)) {
            return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        } else {
            console.log(`Config file at path ${configPath} not found!`);
            return null;
        }
    }
}

config = loadConfig();
if (!config) {
    throw new Error("Config could not be loaded. Exiting...");
}

const logger = new Logger(config);
logger.info('Logger loaded');
logger.info(`as user: ${process.getuid()}`);
logger.info(`as group: ${process.getgid()}`);
logger.info(`current working directory: ${process.cwd()}`);

// Schedule reset for 4AM daily
cron.schedule('0 4 * * *', () => {
    // fetchApiData();
});

// Schedule the task to run every minute
cron.schedule('* * * * *', () => {
    async function processData() {
        if (isRecording()) {
            logger.info('Already recording, skipping this cron cycle...');
            return;
        }

        try {
            const passesFilePath = path.resolve(__dirname, config.passesFile);

            // if file does not exist, create it
            if (!fs.existsSync(passesFilePath)) {
                fs.writeFileSync(passesFilePath, '[]');
                logger.info(`Blank passes file created at ${passesFilePath}`);
                return;
            }

            const backupFilePath = `${passesFilePath}.bak`;
            const tempFilePath = `${passesFilePath}.tmp`;

            let data;
            try {
                data = fs.readFileSync(passesFilePath, 'utf8');
            } catch (error) {
                logger.error(`Error reading file at ${passesFilePath}: ${error}`);
                return;
            }

            if (!data || data.trim() === '') {
                logger.error('No passes found. Retrieving TLE data...');
                await processPasses(config, logger);
                return;
            }

            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                logger.error(`Error parsing JSON data: ${parseError.message}`);
                return;
            }

            const hasEntries = Array.isArray(jsonData) ? jsonData.length > 0 : Object.keys(jsonData).length > 0;

            if (!hasEntries) {
                logger.info('No passes found. Running TLE data...');
                await processPasses(config, logger);
                return;
            }

            const now = new Date();

            jsonData.forEach(item => {
                const recordTime = new Date(`${item.date} ${item.time}`);
                const endRecordTime = new Date(recordTime.getTime() + item.duration * 60000);

                if (now >= recordTime && now <= endRecordTime && !item.recorded) {
                    if (isRecording()) {
                        logger.info('Already recording from within the forEach, returning...');
                        return;
                    }

                    let newDuration = Math.floor((endRecordTime - now) / 60000);

                    logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${newDuration} minutes...`);
                    startRecording(item.frequency, recordTime, item.satellite, newDuration, config);
                    item.recorded = true;
                }
            });

            fs.copyFileSync(passesFilePath, backupFilePath);
            fs.writeFileSync(tempFilePath, JSON.stringify(jsonData, null, 2));
            fs.renameSync(tempFilePath, passesFilePath);

        } catch (err) {
            logger.error(`Error processing data: ${err.message}`);
        }
    }

    processData();
});
