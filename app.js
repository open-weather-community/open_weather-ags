/*
    + How will the API work? Is it a list of ALL satellite passes, just upcoming ones?
        + assuming it is a list of upcoming satellite passes, I should check it against
        the schedule.json to see if there is a new pass to add to the stack
        + then just keep a long list of all passes and add recorded: true when necessary

    + 11025 samples for the wav encoding
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

    // api for the satellite passes
    https://www.n2yo.com/api/

    https://api.n2yo.com/rest/v1/satellite/radiopasses/4/52.495480/13.468430/0/2/40/&apiKey=KQ4CJL-PH6TLP-NK99WQ-4O14
    my lat: 52.495480
    my long: 13.468430

*/

const { spawn } = require('child_process');
const cron = require('node-cron');
const https = require('https');
const fs = require('fs');
const config = require('./config.json');

const apiOptions = {
    hostname: 'api.example.com',
    port: 443,
    path: '/endpoint',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    }
};

// json data with time and date
const dummyData = [{
    satellite: 'NOAA 19',
    frequency: '137.1M',
    time: '5:00 PM',
    date: '2021-09-01'
}];

// download the API data at 5pm daily
cron.schedule('0 17 * * *', () => {

    // api request json data
    const req = https.request(options, res => {
        console.log(`statusCode: ${res.statusCode}`);

        res.on('data', d => {
            const data = JSON.parse(d);
            console.log(data);

            // save to config.file
            fs.writeFileSync(`${config.file}`, JSON.stringify(data));
        });
    });

    req.on('error', error => {
        console.error(error);
    });

    req.end();

});

// Schedule the task to run every minute
cron.schedule('* * * * *', () => {
    // read the JSON file
    fs.readFile(`${config.file}`, 'utf8', (err, data) => {
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
                startRecording(item.frequency, recordTime, item.satellite, 15);
                // make item as recorded
                item.recorded = true;
            }
        });
    });
});

function startRecording(f, timestamp, satellite, durationMinutes) {
    console.log('Starting recording of ', satellite, ' at ', timestamp);

    // Spawn the rtl_fm command and pipe the output to sox
    const rtlFm = spawn('rtl_fm', [
        '-f', f,
        '-M', 'fm',
        '-s', '11025',
        '-r', '11025',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '10'
    ]);



    const sox = spawn('sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '11025',
        '-',
        `recordings/${satellite}-${timestamp}.wav`
    ]);

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after 5 minutes
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        sox.kill();

        // find matching entry in the JSON file and set recorded to true




    }, durationMinutes * 60 * 1000);
}