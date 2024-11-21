const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { printLCD, clearLCD } = require('./lcd'); // Import LCD module
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

    // Define the file path for the final downsampled recording
    const downsampledFile = path.join(dir, `${satellite}-${formattedTimestamp}.wav`);

    logger.info('Recording to ' + downsampledFile);

    // Start rtl_fm process to capture radio signal
    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,
        '-M', 'wbfm',       // Use wideband FM
        '-s', '110250',     // Higher sample rate
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', config.gain
    ]);

    // Start sox process to downsample the audio on the fly
    const soxDownsample = spawn(config.sox_path, [
        '-t', 'raw',          // Input type
        '-r', '110250',       // Match rtl_fm sample rate
        '-e', 'signed',       // Input encoding
        '-b', '16',           // Input bit depth
        '-c', '1',            // Input channels
        '-',                  // Read from stdin
        '-b', '16',           // Output bit depth
        '-e', 'signed',       // Output encoding
        '-t', 'wav',          // Output type
        downsampledFile,      // Output file
        'rate', '-v', '-s', '11025' // Steep filter for downsampling
    ]);

    // Log rtl_fm stderr for debugging
    rtlFm.stderr.on('data', (data) => {
        logger.info(`rtl_fm info: ${data}`);
    });

    // Log sox stderr for debugging
    soxDownsample.stderr.on('data', (data) => {
        logger.error(`Sox error: ${data}`);
    });

    // Pipe the output of rtl_fm directly into sox
    rtlFm.stdout.pipe(soxDownsample.stdin);

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        logger.error('rtl_fm process error: ' + error.message);
        recording = false;
        soxDownsample.stdin.end();
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        logger.info(`rtl_fm process exited with code ${code}`);
        soxDownsample.stdin.end();

        if (code === 0) {
            soxDownsample.on('close', (soxCode) => {
                if (soxCode === 0) {
                    logger.info(`Successfully downsampled to ${downsampledFile}`);

                    // Upload the downsampled file
                    const jsonData = {
                        myID: config.myID,
                        satellite: satellite,
                        locLat: config.locLat,
                        locLon: config.locLon,
                        gain: config.gain,
                        timestamp: formattedTimestamp,
                        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                        auth_token: config.auth_token
                    };

                    // log jsonData
                    logger.info(jsonData);

                    if (!testing) {
                        printLCD('uploading...');

                        uploadFile(downsampledFile, jsonData)
                            .then(response => {
                                if (response.success === false) {
                                    // Handle the error response from uploadFile
                                    console.error('Upload failed:', response.message);
                                    if (response.status) {
                                        console.error('Status:', response.status);
                                    }
                                    if (response.data) {
                                        console.error('Data:', response.data);
                                    }
                                } else {
                                    console.log('Response:', response);
                                    printLCD('upload completed!');
                                }
                            })
                            .catch(error => {
                                // This catch block is for any unexpected errors that might not be handled inside uploadFile
                                console.error('Unexpected error:', error);
                            });
                    }

                } else {
                    logger.error(`Downsampling failed with code ${soxCode}`);
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