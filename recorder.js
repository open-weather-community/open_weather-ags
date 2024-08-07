const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { printLCD, clearLCD } = require('./lcd'); // Import LCD module
require('dotenv').config(); // Load environment variables from .env file
const { uploadFile } = require('./upload');

let recording = false;

const testing = false;

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

    // Log rtl_fm stderr for debugging
    rtlFm.stderr.on('data', (data) => {
        logger.error(`rtl_fm error: ${data}`);
    });

    // Write rtl_fm stdout directly to a raw file
    const rawStream = fs.createWriteStream(rawFile);
    rtlFm.stdout.pipe(rawStream);

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        logger.error('rtl_fm process error: ' + error.message);
        recording = false;
        rawStream.close();
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        logger.info(`rtl_fm process exited with code ${code}`);
        rawStream.close();

        if (code === 0) {
            // Downsample the recorded file to 11025 Hz
            const soxDownsample = spawn(config.sox_path, [
                rawFile,
                '-r', '11025',
                downsampledFile
            ]);

            // Capture and log Sox error output
            soxDownsample.stderr.on('data', (data) => {
                logger.error(`Sox error: ${data}`);
            });

            // Handle downsample completion
            soxDownsample.on('close', (code) => {
                if (code === 0) {
                    logger.info(`Successfully downsampled to ${downsampledFile}`);

                    // Upload the downsampled file
                    // Get json data from the config
                    const jsonData = {
                        myID: config.myID,
                        locLat: config.locLat,
                        locLon: config.locLon,
                        gain: config.gain,
                        timestamp: formattedTimestamp,
                    };

                    if (!testing) {
                        printLCD('uploading...');

                        uploadFile(downsampledFile, jsonData)
                            .then(response => {
                                // Handle success if needed
                                console.log('Response:', response);

                                printLCD('upload completed!');
                            })
                            .catch(error => {
                                // Handle error if needed
                                console.error('Error:', error);
                            });
                    }

                } else {
                    logger.error(`Downsampling failed with code ${code}`);
                }
            });

            // Handle potential errors in the downsample process
            soxDownsample.on('error', (error) => {
                logger.error('Sox downsample process error: ' + error.message);
            });
        } else {
            logger.error('rtl_fm did not exit cleanly, skipping downsampling.');
        }
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        logger.info('Stopping recording...');
        rtlFm.kill();
        recording = false;
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

module.exports = { isRecording, startRecording };
