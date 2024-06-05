const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { startRecording } = require('./recorder');
const { processPasses } = require('./tle.js');
const Logger = require('./logger');

// log boot
Logger.info('project booting up =================================================');
Logger.info("as user: " + process.getuid());
Logger.info("as group: " + process.getgid());
Logger.info("current working directory: " + process.cwd());

// schedule to download the API data at 5pm daily
cron.schedule('0 17 * * *', () => {
    // fetchApiData();
});

// schedule the task to run every minute
cron.schedule('* * * * *', () => {
    async function processData() {

        try {
            const passesFilePath = path.resolve(__dirname, config.passesFile);
            const backupFilePath = `${passesFilePath}.bak`;
            const tempFilePath = `${passesFilePath}.tmp`;

            let data;
            try {
                data = fs.readFileSync(passesFilePath, 'utf8');
            } catch (error) {
                Logger.error(`Error reading file at ${passesFilePath}: ` + error);
            }

            // check if the file content is empty
            if (!data || data.trim() === '') {
                Logger.error('No passes found. Retrieving TLE data...');
                await processPasses();
                return;
            }

            // Parse the JSON data
            let jsonData;
            try {
                jsonData = JSON.parse(data);
            } catch (parseError) {
                Logger.error('Error parsing JSON data: ' + parseError.message);
                return;
            }

            // check if the parsed JSON data has entries
            const hasEntries = Array.isArray(jsonData) ? jsonData.length > 0 : Object.keys(jsonData).length > 0;

            if (!hasEntries) {
                Logger.info('No passes found. Running TLE data...');
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

                //Logger.info(`got entry ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes... and now is ${now} and record time is ${recordTime} and end record time is ${endRecordTime}`);

                if (now >= recordTime && now <= endRecordTime && !item.recorded) {

                    let newDuration = item.duration;
                    if (now > recordTime + 60000) {
                        newDuration = Math.floor((endRecordTime - now) / 60000);
                    }

                    Logger.info(`Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...\n`);
                    startRecording(item.frequency, recordTime, item.satellite, item.duration);
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
            Logger.error('Error processing data: ' + err.message);
        }
    }

    processData();
});
