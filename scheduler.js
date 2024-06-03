const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { fetchApiData } = require('./api');
const { startRecording } = require('./recorder');
const { processPasses } = require('./tle.js');
const Logger = require('./logger');


// log boot
Logger.info('Project booting up');


// Schedule to download the API data at 5pm daily
cron.schedule('0 17 * * *', () => {
    // fetchApiData();
});

// Schedule the task to run every minute
cron.schedule('* * * * *', () => {
    // Read the JSON file
    fs.readFile(path.resolve(__dirname, config.passesFile), 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        // Check if the file content is empty
        if (!data || data.trim() === '') {
            console.log('No passes found. Running TLE data...');
            processPasses();
            return;
        }

        let jsonData;

        try {
            // Parse the JSON data
            jsonData = JSON.parse(data);
        } catch (parseErr) {
            console.error('Error parsing JSON:', parseErr);
            return;
        }

        // Check if the parsed JSON data has entries
        const hasEntries = Array.isArray(jsonData) ? jsonData.length > 0 : Object.keys(jsonData).length > 0;

        if (!hasEntries) {
            console.log('No passes found. Running TLE data...');
            processPasses();
            return;
        }

        // Get the current time
        const now = new Date();
        // Check if it's time to start recording
   
        jsonData.forEach(item => {
            const recordTime = new Date(`${item.date} ${item.time}`);
            if (now >= recordTime && !item.recorded) {
                startRecording(item.frequency, recordTime, item.satellite, item.duration);
                // write to log file that it is recording this pass
                fs.appendFile(logPath
                    , `${new Date().toISOString()} - Recording ${item.satellite} at ${item.date} ${item.time} for ${item.duration} minutes...\n`
                    , err => {
                        if (err) {
                            console.error('Error writing to log file:', err);
                        }
                    });

                // Mark item as recorded
                item.recorded = true;
            }
        });

        // Write updated JSON data back to the file
        fs.writeFile(path.resolve(__dirname, config.passesFile), JSON.stringify(jsonData, null, 2), err => {
            if (err) {
                console.error('Error writing file:', err);
            }
        });
    });
});
