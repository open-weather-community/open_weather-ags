const path = require('path');
const logger = console; // Using console for logging in this test script
const { startRecording } = require('./recorder'); // Adjust the path if necessary

// Configuration object
const config = {
    saveDir: path.join('/media/openweather/o-w1/testrecordings'), // Directory to save recordings
    rtl_fm_path: '/usr/bin/rtl_fm', // Path to rtl_fm executable
    gain: '50' // Gain setting for rtl_fm
};

// Ensure the recordings directory exists
function ensureDirectoryExists(dir) {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
}

// Format the timestamp for filenames
function formatTimestamp(timestamp) {
    return new Date(timestamp).toISOString().replace(/:/g, '-');
}

// Test function to start recording
function testRecorder(frequency) {
    const timestamp = Date.now();
    const satellite = 'test_satellite';
    const durationMinutes = 1; // Record for 1 minute

    startRecording(frequency, timestamp, satellite, durationMinutes, config, logger);
}

// Example usage: Record at 100 MHz
testRecorder(104600000); // Frequency in Hz