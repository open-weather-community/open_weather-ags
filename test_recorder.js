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

    // Define file paths for raw and downsampled recordings
    const outputPath = path.join(dir, `${frequency}-${formattedTimestamp}`);
    const rawFile = `${outputPath}-raw.wav`;
    const downsampledFile = `${outputPath}.wav`;

    console.log('Recording to ' + rawFile);

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

    // Write rtl_fm stdout directly to a raw file
    const rawStream = fs.createWriteStream(rawFile);
    rtlFm.stdout.pipe(rawStream);

    // Handle potential errors in the rtl_fm process
    rtlFm.on('error', (error) => {
        console.log('rtl_fm process error: ' + error.message);
        recording = false;
        rawStream.close();
    });

    // Handle rtl_fm process exit
    rtlFm.on('close', (code) => {
        console.log(`rtl_fm process exited with code ${code}`);
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
                console.log(`Sox error: ${data}`);
            });

            // Handle downsample completion
            soxDownsample.on('close', (code) => {
                if (code === 0) {
                    console.log(`Successfully downsampled to ${downsampledFile}`);

                } else {
                    console.log(`Downsampling failed with code ${code}`);
                }
            });

            // Handle potential errors in the downsample process
            soxDownsample.on('error', (error) => {
                console.log('Sox downsample process error: ' + error.message);
            });
        } else {
            console.log('rtl_fm did not exit cleanly, skipping downsampling.');
        }
    });

    // Stop the recording after the specified duration
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        recording = false;
    }, durationMinutes * 60 * 1000); // Convert minutes to milliseconds
}

startRecording("1045000000", 1);