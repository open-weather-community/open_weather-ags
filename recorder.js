/**
 * Recording module for Open-Weather AGS
 * Handles automated satellite signal recording using RTL-SDR
 * Manages audio processing, file naming, and upload coordination
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { printLCD, clearLCD } = require('./lcd');
const { uploadFile, uploadFileWithRetries } = require('./upload');
const { ensureDirectoryExists, formatTimestampForFilename, toLocalISOString } = require('./utils');

let recording = false;

/**
 * Check if a recording is currently in progress
 * @returns {boolean} - True if recording is active
 */
function isRecording() {
    return recording;
}

/**
 * Format timestamp for filename use (delegates to utils)
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string} - Formatted timestamp
 * @deprecated Use formatTimestampForFilename from utils instead
 */
function formatTimestamp(timestamp) {
    return formatTimestampForFilename(timestamp);
}

/**
 * Start recording a satellite pass
 * @param {string} frequency - Satellite frequency (e.g., "137.1M")
 * @param {Date} timestamp - Recording start time
 * @param {string} satellite - Satellite name (e.g., "NOAA 19")
 * @param {number} durationMinutes - Recording duration in minutes
 * @param {Object} config - Configuration object
 * @param {Object} logger - Logger instance
 */
function startRecording(frequency, timestamp, satellite, durationMinutes, config, logger) {
    // check if a recording is already in progress
    if (recording) {
        logger.info('Already recording...');
        return;
    }

    recording = true;
    logger.info('Starting recording of ' + satellite);

    // ensure the recordings directory exists
    const dir = path.join(config.saveDir, 'recordings');
    ensureDirectoryExists(dir);

    // format the timestamp for a filesystem-friendly filename
    const formattedTimestamp = toLocalISOString(timestamp);

    // set sampleRate to config.sampleRate, or default to '48k'
    const sampleRate = config.sampleRate ?? '48k';

    // set gain to config.gain, or default to '40'
    const gain = config.gain ?? '40';

    // set downsampling preference to config.downsample
    const doDownsample = config.downsample ?? true;

    // define file paths
    const fileTimestamp = formattedTimestamp.replace(/:/g, '-');    // otherwise it will be an invalid filename
    const rawFile = path.join(dir, `${satellite}-${fileTimestamp}.raw`);
    const wavFile = path.join(dir, `${satellite}-${fileTimestamp}.wav`);

    logger.info('Recording raw data to ' + rawFile);

    // start rtl_fm process to capture radio signal
    const rtlFm = spawn(config.rtl_fm_path, [
        '-f', frequency,          // Frequency
        '-M', 'fm',               // Modulation type
        '-s', sampleRate,         // Sampling rate
        '-l', '0',                // Squelch level
        '-g', gain,               // Gain
        '-E', 'deemp',            // Enable de-emphasis filter
        '-F', '9'                 // Set filtering mode
    ]);

    // log rtl_fm stderr for debugging
    rtlFm.stderr.on('data', (data) => {
        logger.info(`rtl_fm info: ${data}`);
    });

    // handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        logger.error('rtl_fm process error: ' + error.message);
        recording = false;
        writeStream.end();
    });

    // write raw data to file
    const writeStream = fs.createWriteStream(rawFile);

    // pipe the output of rtl_fm directly into the write stream
    rtlFm.stdout.pipe(writeStream);

    writeStream.on('finish', () => {
        logger.info(`Successfully saved raw audio to ${rawFile}`);

        if (doDownsample) {
            // use SoX to downsample and convert raw audio to WAV
            logger.info('Starting SoX process to downsample and convert to WAV');
            const soxProcess = spawn(config.sox_path, [
                '-t', 'raw',          // input type is raw
                '-r', sampleRate,     // input sample rate
                '-e', 'signed',       // input encoding
                '-b', '16',           // input bit depth
                '-c', '1',            // input channels
                rawFile,              // input file
                '-e', 'signed',       // iutput encoding
                '-t', 'wav',          // iutput type is WAV
                wavFile,              // iutput file
                'rate', '-v', '11025' // resample to 11025 Hz with very high quality
            ]);

            // log SoX stderr for debugging
            soxProcess.stderr.on('data', (data) => {
                logger.error(`SoX error: ${data}`);
            });

            // handle potential errors in the SoX process
            soxProcess.on('error', (error) => {
                logger.error('SoX process error: ' + error.message);
                recording = false;
            });

            // handle SoX process exit
            soxProcess.on('close', (soxCode) => {
                if (soxCode === 0) {
                    logger.info(`Successfully processed audio to ${wavFile}`);

                    // upload the WAV file
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
                    logger.info('JSON data for upload:');

                    // don't log the auth_token though
                    const sanitizedData = {
                        ...jsonData,
                        auth_token: jsonData.auth_token ? '*'.repeat(jsonData.auth_token.length) : '[REDACTED]'
                    };
                    logger.info(JSON.stringify(sanitizedData, null, 2));

                    // log filesize
                    const stats = fs.statSync(wavFile);
                    const fileSizeInBytes = stats.size;
                    const fileSizeInKilobytes = fileSizeInBytes / 1024;
                    logger.info(`File size: ${fileSizeInKilobytes} KB`);

                    printLCD('uploading...');

                    uploadFileWithRetries(wavFile, jsonData, logger, 5, 10000) // e.g. up to 5 attempts, 10-second delay
                        .then(response => {
                            if (response.success === false) {
                                logger.error('Upload ultimately failed after retries:', JSON.stringify(response, null, 2));
                            } else {
                                logger.info('Upload successful:', response);
                                printLCD('upload completed!');
                            }
                        })
                        .catch(error => {
                            // catch any unexpected thrown errors
                            logger.error('Unexpected error during upload retries:', error);
                        })
                        .finally(() => {
                            recording = false; // ensure recording flag is reset
                        });

                } else {
                    logger.error(`SoX processing failed with code ${soxCode}`);
                    recording = false; // ensure recording flag is reset
                }
            });

        } else {
            // no downsampling; recording is complete.
            logger.info('Downsampling not enabled; recording complete.');
            recording = false; // ensure recording flag is reset
        }
    });

    writeStream.on('error', (error) => {
        logger.error('Write stream error: ' + error.message);
        recording = false;
    });

    // handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        logger.info(`rtl_fm process exited with code ${code}`);
        if (code !== 0) {
            logger.error('rtl_fm did not exit cleanly.');
            writeStream.end();
            recording = false;
        }
    });

    // stop the recording after the specified duration
    setTimeout(() => {
        logger.info('Stopping recording...');
        rtlFm.kill();

        // if recording is still in progress after killing rtl_fm, set a timeout to forcefully end it
        setTimeout(() => {
            if (recording) {
                logger.notice('Forcing recording to stop due to timeout.');
                recording = false;
            }
        }, 10000); // 10 seconds grace period
    }, durationMinutes * 60 * 1000); // convert minutes to milliseconds
}

module.exports = { isRecording, startRecording };
