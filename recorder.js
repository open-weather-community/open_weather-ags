const { spawn } = require('child_process');
const config = require('./config.json');
const Logger = require('./logger');
const fs = require('fs');

let recording = false;

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
    const dir = `${config.saveDir}/recordings`;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    const outputPath = `${config.saveDir}/recordings/${satellite}-${timestamp}`;
    const rawFile = `${outputPath}-raw.wav`;
    const downsampledFile = `${outputPath}.wav`;

    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,
        '-M', 'fm',
        '-s', '48k',    // recording sample rate, be sure to match below at -r
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', config.gain
    ]);

    const sox = spawn(config.sox_path, [
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
