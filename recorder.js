const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { printLCD, clearLCD } = require('./lcd'); // Import LCD module
const { uploadFile } = require('./upload');

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

    // Set sampleRate to config.sampleRate, or default to '48k'
    const sampleRate = config.sampleRate ?? '48k';

    // Set gain to config.gain, or default to '40'
    const gain = config.gain ?? '40';

    // Set downsampling preference to config.downsample, or default to false
    const doDownsample = config.downsample ?? false;

    // Define file paths
    const rawFile = path.join(dir, `${satellite}-${formattedTimestamp}.raw`);
    const wavFile = path.join(dir, `${satellite}-${formattedTimestamp}.wav`);

    logger.info('Recording raw data to ' + rawFile);

    // Start rtl_fm process to capture radio signal
    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,
        '-M', 'fm',
        '-s', sampleRate,
        '-l', '0',
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
        writeStream.end();
    });

    // Write raw data to file
    const writeStream = fs.createWriteStream(rawFile);

    // Pipe the output of rtl_fm directly into the write stream
    rtlFm.stdout.pipe(writeStream);

    writeStream.on('finish', () => {
        logger.info(`Successfully saved raw audio to ${rawFile}`);

        if (doDownsample) {
            // Use SoX to downsample and convert raw audio to WAV
            logger.info('Starting SoX process to downsample and convert to WAV');
            const soxProcess = spawn(config.sox_path, [
                '-t', 'raw',          // Input type is raw
                '-r', sampleRate,     // Input sample rate
                '-e', 'signed',       // Input encoding
                '-b', '16',           // Input bit depth
                '-c', '1',            // Input channels
                rawFile,              // Input file
                '-e', 'signed',       // Output encoding
                '-t', 'wav',          // Output type is WAV
                wavFile,              // Output file
                'rate', '-v', '11025' // Resample to 11025 Hz with very high quality
            ]);

            // Log SoX stderr for debugging
            soxProcess.stderr.on('data', (data) => {
                logger.error(`SoX error: ${data}`);
            });

            // Handle potential errors in the SoX process
            soxProcess.on('error', (error) => {
                logger.error('SoX process error: ' + error.message);
                recording = false;
            });

            // Handle SoX process exit
            soxProcess.on('close', (soxCode) => {
                if (soxCode === 0) {
                    logger.info(`Successfully processed audio to ${wavFile}`);

                    // Upload the WAV file
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

                    printLCD('uploading...');

                    uploadFile(wavFile, jsonData)
                        .then(response => {
                            if (response.success === false) {
                                // Handle the error response from uploadFile
                                logger.error('Upload failed:', response.message);
                                if (response.status) {
                                    logger.error('Status:', response.status);
                                }
                                if (response.data) {
                                    logger.error('Data:', response.data);
                                }
                            } else {
                                logger.info('Upload successful:', response);
                                printLCD('upload completed!');
                            }
                        })
                        .catch(error => {
                            // Catch any unexpected errors
                            logger.error('Unexpected error during upload:', error);
                        })
                        .finally(() => {
                            recording = false; // Ensure recording flag is reset
                        });

                } else {
                    logger.error(`SoX processing failed with code ${soxCode}`);
                    recording = false; // Ensure recording flag is reset
                }
            });

        } else {
            // No downsampling; recording is complete.
            logger.info('Downsampling not enabled; recording complete.');
            recording = false; // Ensure recording flag is reset
        }
    });

    writeStream.on('error', (error) => {
        logger.error('Write stream error: ' + error.message);
        recording = false;
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        logger.info(`rtl_fm process exited with code ${code}`);
        if (code !== 0) {
            logger.error('rtl_fm did not exit cleanly.');
            writeStream.end();
            recording = false;
        }
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        logger.info('Stopping recording...');
        rtlFm.kill();

        // If recording is still in progress after killing rtl_fm, set a timeout to forcefully end it
        setTimeout(() => {
            if (recording) {
                logger.warn('Forcing recording to stop due to timeout.');
                recording = false;
            }
        }, 10000); // 10 seconds grace period
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

module.exports = { isRecording, startRecording };
