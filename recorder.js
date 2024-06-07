const { spawn } = require('child_process');
let recording = false;
const config = require('./config.json');
const Logger = require('./logger');
const fs = require('fs');

function isRecording() {
    return recording;
}

function startRecording(frequency, timestamp, satellite, durationMinutes) {

    if (recording) {
        Logger.info('Already recording...');
        return;
    }

    recording = true;

    Logger.info('Starting recording of ' + satellite);

    // Make dir if it doesn't exist
    const dir = `${config.usbPath}/recordings`;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    const outputPath = `${config.usbPath}/recordings/${satellite}-${timestamp}`;
    const rawFile = `${outputPath}-raw.wav`;
    const downsampledFile = `${outputPath}.wav`;

    // Record at 48000 Hz
    const rtlFm = spawn('/usr/local/bin/rtl_fm', [
        '-f', frequency,
        '-M', 'fm',
        '-s', '48k',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '38'
    ]);

    const sox = spawn('/usr/bin/sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '48000',
        '-',
        rawFile
    ]);

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after durationMinutes minutes
    setTimeout(() => {
        Logger.info('Stopping recording...');
        rtlFm.kill();
        sox.kill();
        recording = false;

        // Downsample to 11025 Hz after stopping the initial recording
        const soxDownsample = spawn('/usr/bin/sox', [
            rawFile,
            '-r', '11025',
            downsampledFile
        ]);

        soxDownsample.on('close', (code) => {
            if (code === 0) {
                Logger.info(`Successfully downsampled to ${downsampledFile}`);
                // Optionally, remove the raw file
                //fs.unlinkSync(rawFile);
            } else {
                Logger.error(`Downsampling failed with code ${code}`);
            }
        });
    }, durationMinutes * 60 * 1000);
}

module.exports = { isRecording, startRecording };
