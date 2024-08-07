const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Function to format the timestamp for filenames
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().replace(/:/g, '-');
}

// Function to start recording
function startRecording(frequency, durationMinutes) {

    recording = true;

    // Ensure the recordings directory exists
    const dir = path.join('/media/openweather/o-w1/testrecordings');

    // Format the timestamp for a filesystem-friendly filename
    const formattedTimestamp = formatTimestamp(Date.now());

    // Define file paths for downsampled recordings
    const downsampledFile = path.join(dir, `${frequency}-${formattedTimestamp}.wav`);

    console.log('Recording to ' + downsampledFile);

    // Start rtl_fm process to capture radio signal
    const rtlFm = spawn("/usr/local/bin/rtl_fm", [
        '-f', frequency,
        '-M', 'fm',
        '-s', '48k',    // Recording sample rate, match with sox input rate
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '30'
    ]);

    // Log rtl_fm stderr for debugging
    rtlFm.stderr.on('data', (data) => {
        console.log(`rtl_fm log: ${data}`);
    });

    // Use sox to process the stream directly and save as WAV
    const soxDownsample = spawn("/usr/bin/sox", [
        '-t', 'raw', // Input type
        '-r', '48000', // Input sample rate
        '-e', 'signed-integer', // Input encoding
        '-b', '16', // Input bit depth
        '-c', '1', // Input channels
        '-', // Input from stdin
        '-r', '11025', // Output sample rate
        downsampledFile
    ]);

    // Pipe rtl_fm output directly to sox
    rtlFm.stdout.pipe(soxDownsample.stdin);

    // Capture and log Sox error output
    soxDownsample.stderr.on('data', (data) => {
        console.log(`Sox error: ${data}`);
    });

    // Handle sox process completion
    soxDownsample.on('close', (code) => {
        if (code === 0) {
            console.log(`Successfully recorded to ${downsampledFile}`);
        } else {
            console.log(`Sox processing failed with code ${code}`);
        }
    });

    // Handle potential errors in the sox process
    soxDownsample.on('error', (error) => {
        console.log('Sox process error: ' + error.message);
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        console.log(`rtl_fm process exited with code ${code}`);
    });

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        console.log('rtl_fm process error: ' + error.message);
        recording = false;
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        recording = false;
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

startRecording("1045000000", 1);