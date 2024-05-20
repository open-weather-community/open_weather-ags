const cron = require('node-cron');
const fs = require('fs');
const path = require('path');
const config = require('./config.json');
const { fetchApiData } = require('./api');
const { startRecording } = require('./recorder');

// testing area...

// Schedule to download the API data at 5pm daily
cron.schedule('0 17 * * *', () => {
    fetchApiData();
});

// Schedule the task to run every minute
cron.schedule('* * * * *', () => {
    // Read the JSON file
    fs.readFile(path.resolve(__dirname, config.file), 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        // Parse the JSON data
        const jsonData = JSON.parse(data);

        // Get the current time
        const now = new Date();

        // Check if it's time to start recording
        jsonData.forEach(item => {
            const recordTime = new Date(`${item.date} ${item.time}`);
            if (now >= recordTime && !item.recorded) {
                startRecording(item.frequency, recordTime, item.satellite, item.duration);
                // Mark item as recorded
                item.recorded = true;
            }
        });

        // Write updated JSON data back to the file
        fs.writeFile(path.resolve(__dirname, config.file), JSON.stringify(jsonData, null, 2), err => {
            if (err) {
                console.error('Error writing file:', err);
            }
        });
    });
});
