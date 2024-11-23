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

    // Define the file path for the final recording
    const finalFile = path.join(dir, `${satellite}-${formattedTimestamp}.wav`);

    logger.info('Recording to ' + finalFile);

    // Set sampleRate to config.sampleRate, or default to 60000
    const sampleRate = config.sampleRate ?? '60000';

    // Set gain to config.gain, or default to 40
    const gain = config.gain ?? '40';

    // Set downsampling preference to config.downsample, or default to false
    const doDownsample = config.downsample ?? false;


    // Start rtl_fm process to capture radio signal
    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,
        '-M', 'fm',
        '-s', sampleRate,
        '-l', '0',
        '-E', 'deemp',
        '-g', gain
    ]);

    // Log rtl_fm stderr for debugging
    rtlFm.stderr.on('data', (data) => {
        logger.info(`rtl_fm info: ${data}`);
    });

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        logger.error('rtl_fm process error: ' + error.message);
        recording = false;
        if (soxProcess) {
            soxProcess.stdin.end();
        }
    });

    let soxProcess = null;
    if (doDownsample) {
        // Use SoX to downsample and convert raw audio to WAV
        soxProcess = spawn(config.sox_path, [
            '-t', 'raw',          // Input type is raw
            '-r', sampleRate,     // Input sample rate
            '-e', 'signed',       // Input encoding
            '-b', '16',           // Input bit depth
            '-c', '1',            // Input channels
            '-',                  // Read from stdin
            '-b', '16',           // Output bit depth
            '-e', 'signed',       // Output encoding
            '-t', 'wav',          // Output type is WAV
            finalFile,            // Output file
            'rate', '-v', '11025' // Resample to 11025 Hz with very high quality
        ]);
    } else {
        // Use SoX to convert raw audio to WAV without changing the sample rate
        soxProcess = spawn(config.sox_path, [
            '-t', 'raw',      // Input type is raw
            '-r', sampleRate, // Input sample rate
            '-e', 'signed',   // Input encoding
            '-b', '16',       // Input bit depth
            '-c', '1',        // Input channels
            '-',              // Read from stdin
            '-b', '16',       // Output bit depth
            '-e', 'signed',   // Output encoding
            '-t', 'wav',      // Output type is WAV
            finalFile         // Output file
        ]);
    }

    // Log SoX stderr for debugging
    soxProcess.stderr.on('data', (data) => {
        logger.error(`SoX error: ${data}`);
    });

    // Pipe the output of rtl_fm directly into SoX
    rtlFm.stdout.pipe(soxProcess.stdin);

    // Handle potential errors in the SoX process
    soxProcess.on('error', (error) => {
        logger.error('SoX process error: ' + error.message);
    });

    // Handle SoX process exit
    soxProcess.on('close', (soxCode) => {
        if (soxCode === 0) {
            logger.info(`Successfully processed audio to ${finalFile}`);

            // Upload the final file
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

            // Log jsonData
            logger.info(jsonData);

            if (!testing) {
                printLCD('uploading...');

                uploadFile(finalFile, jsonData)
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
                        // Catch any unexpected errors
                        console.error('Unexpected error:', error);
                    });
            }

        } else {
            logger.error(`SoX processing failed with code ${soxCode}`);
        }

        recording = false; // Ensure recording flag is reset
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        logger.info(`rtl_fm process exited with code ${code}`);
        if (code !== 0) {
            logger.error('rtl_fm did not exit cleanly.');
            // End SoX process if rtl_fm exits unexpectedly
            if (soxProcess) {
                soxProcess.stdin.end();
            }
            recording = false;
        }
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        logger.info('Stopping recording...');
        rtlFm.kill();
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

module.exports = { isRecording, startRecording };
