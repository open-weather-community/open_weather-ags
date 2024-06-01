const { spawn } = require('child_process');
let isRecording = false;

function startRecording(frequency, timestamp, satellite, durationMinutes) {

    if (isRecording) {
        console.log('Already recording...');
        return;
    }

    isRecording = true;

    console.log('Starting recording of ', satellite, ' at ', timestamp);

    //rtl_fm -f 104.6M -M fm -s 170k -r 32k -A fast -l 0 -E deemp -g 10 | sox -t raw -e signed -c 1 -b 16 -r 32000 - fm104-6.wav # FM radio station in Berlin
    // Spawn the rtl_fm command and pipe the output to sox
    const rtlFm = spawn('rtl_fm', [
        '-f', frequency,
        '-M', 'fm',
        '-s', '44k',
        '-r', '11025',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '20'
    ]);

    const sox = spawn('sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '11025',
        '-',
        `recordings/${satellite}-${timestamp}.wav`
    ]);

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after durationMinutes minutes
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        sox.kill();
        isRecording = false;
    }, durationMinutes * 60 * 1000);
}

module.exports = { startRecording };
