/*

    + get shared doc of bill's adjustments
    + how long should the wave form be recorded for?
        + is it possible to start recording when there is a good signal to noise ratio?
        + or just start at 8 degrees over horizon instead?

        relevant:
        Perform FFT:

    Use fft-js to perform Fast Fourier Transform (FFT) calculations on the windowed samples.
    Convert the time-domain samples into the frequency domain.

    + have a threshold for each station

Estimate Noise Floor:

    Analyze the power spectrum obtained from the FFT to estimate the noise floor.
    You can estimate the noise floor as the average power in a frequency band where there is no significant signal present.

    Lizzie and Dan: will API be responsive to lat/long of the device? what exactly will it return?

*/

const { spawn } = require('child_process');
const cron = require('node-cron');
const https = require('https');
const fs = require('fs');
const config = require('./config.json');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

// schedule
cron.schedule('11 12 * * *', () => {

    // do a git pull
    // this should also happen at a more system-foundational level like on restart though...
    // const { exec } = require('child_process');
    // exec('git pull', (err, stdout, stderr) => {
    //     if (err) {
    //         console.error(err);
    //         return;
    //     }
    //     console.log(stdout);
    // }
    // );


    // api request json data
    // const req = https.request(options, res => {
    //     console.log(`statusCode: ${res.statusCode}`);

    //     res.on('data', d => {
    //         const data = JSON.parse(d);
    //         console.log(data);

    //         // save to config.file
    //         fs.writeFileSync(`${config.file}`, JSON.stringify(data));
    //     });
    // });

    // req.on('error', error => {
    //     console.error(error);
    // });

    // req.end();

});

// Schedule the task to run every minute
cron.schedule('* * * * *', () => {
    // read the JSON file
    fs.readFile(`${config.passesFile}`, 'utf8', (err, data) => {
        if (err) {
            console.error(err);
            return;
        }

        // parse the JSON data
        const jsonData = JSON.parse(data);

        // get the current time
        const now = new Date();

        // check if it's time to start recording
        jsonData.forEach(item => {
            const recordTime = new Date(item.date + ' ' + item.time);
            if (now >= recordTime && !item.recorded) {
                startRecording(item.frequency, recordTime, item.satellite, item.duration);
                // make item as recorded
                item.recorded = true;
            }
        });
    });
});



function startRecording(f, timestamp, satellite, durationMinutes) {
    const fileName = `recordings/${satellite}-${timestamp}.wav`;
    console.log('Starting recording of ', satellite, ' at ', timestamp, ' for ', durationMinutes, ' minutes', ' to ', fileName);

    // Spawn the rtl_fm command and pipe the output to sox
    const rtlFm = spawn('rtl_fm', [
        '-f', f,
        '-M', 'fm',
        '-s', '44k',
        '-r', '11025',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20'
    ]);

    const sox = spawn('sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '11025',
        '-',
        fileName
    ]);

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after x minutes
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        sox.kill();

        // find matching entry in the JSON file and set recorded to true
        // ...

        // upload the file to the server
        // uploadFile(fileName, 'https://api.example.com/upload', satellite, config.locLat, config.locLon);


    }, durationMinutes * 60 * 1000);
}

async function uploadFile(filePath, url, satelliteName, lat, lon) {
    // read the file as a buffer
    const fileData = fs.readFileSync(filePath);

    // create a FormData object to include the file data and additional fields
    const formData = new FormData();
    formData.append('file', fileData, {
        filename: 'file.txt',
        contentType: 'application/octet-stream'
    });
    formData.append('satelliteName', satelliteName);
    formData.append('latitude', lat);
    formData.append('longitude', lon);

    try {
        // make a POST request to the server with the FormData and authentication headers
        const response = await axios.post(url, formData, {
            headers: {
                'Content-Type': 'multipart/form-data', // set the content type to multipart/form-data
                'Authorization': `Bearer ${process.env.AUTH_TOKEN}` // use the authentication token from environment variables
            },
        });

        // log the response from the server
        console.log(response.data);
    } catch (error) {
        // log any errors
        console.error('Error uploading file:', error);
    }
}