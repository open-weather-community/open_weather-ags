const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { printLCD, clearLCD } = require('./lcd'); // Import LCD module

let recording = false;

// Function to check if recording is in progress
function isRecording() {
    return recording;
}

// Function to create directory recursively
function ensureDirectoryExists(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

// Function to format the timestamp for filenames
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().replace(/:/g, '-');
}

// Function to start recording
function startRecording(frequency, timestamp, satellite, durationMinutes, config, logger) {
    // Check if a recording is already in progress
    if (recording) {
        logger.info('Already recording...');
        return;
    }

    recording = true;
    logger.info('Starting recording of ' + satellite);

    // Ensure the recordings directory exists
    const dir = path.join(config.saveDir, 'recordings');
    ensureDirectoryExists(dir);

    // Format the timestamp for a filesystem-friendly filename
    const formattedTimestamp = formatTimestamp(timestamp);

    // Define file paths for raw and downsampled recordings
    const outputPath = path.join(dir, `${satellite}-${formattedTimestamp}`);
    const rawFile = `${outputPath}-raw.wav`;
    const downsampledFile = `${outputPath}.wav`;

    logger.info('Recording to ' + rawFile);

    // Start rtl_fm process to capture radio signal
    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,
        '-M', 'fm',
        '-s', '48k',    // Recording sample rate, match with sox input rate
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', config.gain
    ]);

    // Start sox process to save the captured signal to a file
    const sox = spawn(config.sox_path, [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '48000',
        '-',
        rawFile
    ]);

    // Pipe rtl_fm output to sox input
    rtlFm.stdout.pipe(sox.stdin);

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        logger.error('rtl_fm process error: ' + error.message);
        recording = false;
        sox.kill();
    });

    // Handle potential errors in the sox process
    sox.on('error', (error) => {
        logger.error('Sox process error: ' + error.message);
        recording = false;
        rtlFm.kill();
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        logger.info('Stopping recording...');
        rtlFm.kill();
        sox.kill();
        recording = false;

        // Downsample the recorded file to 11025 Hz
        const soxDownsample = spawn(config.sox_path, [
            rawFile,
            '-r', '11025',
            downsampledFile
        ]);

        // Capture and log Sox output
        soxDownsample.stdout.on('data', (data) => {
            logger.info(`Sox output: ${data}`);
        });

        soxDownsample.stderr.on('data', (data) => {
            logger.error(`Sox error: ${data}`);
        });

        // Handle downsample completion
        soxDownsample.on('close', (code) => {
            if (code === 0) {
                logger.info(`Successfully downsampled to ${downsampledFile}`);
                // Optionally, remove the raw file after downsampling
                // fs.unlinkSync(rawFile);
            } else {
                logger.error(`Downsampling failed with code ${code}`);
            }
        });

        // Handle potential errors in the downsample process
        soxDownsample.on('error', (error) => {
            logger.error('Sox downsample process error: ' + error.message);
        });
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

module.exports = { isRecording, startRecording };
