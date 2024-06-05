const { spawn } = require('child_process');
let recording = false;
const config = require('./config.json');
const Logger = require('./logger');
const fs = require('fs');

function isRecording() {
    return recording;
}

function startRecording(frequency, timestamp, satellite, durationMinutes) {

    // if (recording) {
    //     Logger.info('Already recording...');
    //     return;
    // }

    recording = true;

    Logger.info('Starting recording of ' + satellite);

    //rtl_fm -f 104.6M -M fm -s 170k -r 32k -A fast -l 0 -E deemp -g 10 | sox -t raw -e signed -c 1 -b 16 -r 32000 - fm104-6.wav # FM radio station in Berlin
    // Spawn the rtl_fm command and pipe the output to sox
    const rtlFm = spawn('/usr/local/bin/rtl_fm', [
        '-f', frequency,
        '-M', 'fm',
        '-s', '44k',
        '-r', '11025',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20'
    ]);

    const sox = spawn('/usr/bin/sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '11025',
        '-',
        `${config.usbPath}/recordings/${satellite}-${timestamp}.wav`
    ]);

    // make dir if it doesn't exist
    const dir = `${config.usbPath}/recordings`;
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir);
    }

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after durationMinutes minutes
    setTimeout(() => {
        Logger.info('Stopping recording...');
        rtlFm.kill();
        sox.kill();
        recording = false;
    }, durationMinutes * 60 * 1000);
}

module.exports = { isRecording, startRecording };
