const { spawn } = require('child_process');
const cron = require('node-cron');

// Schedule the task to run at 5pm every day
cron.schedule('42 22 * * *', () => {
    console.log('Starting recording...');

    // Spawn the rtl_fm command and pipe the output to sox
    const rtlFm = spawn('rtl_fm', [
        '-f', '104.6M',
        '-M', 'fm',
        '-s', '170k',
        '-r', '32k',
        '-A', 'fast',
        '-l', '0',
        '-E', 'deemp',
        '-g', '10'
    ]);

    const sox = spawn('sox', [
        '-t', 'raw',
        '-e', 'signed',
        '-c', '1',
        '-b', '16',
        '-r', '32000',
        '-',
        'test_rtl.wav'
    ]);

    rtlFm.stdout.pipe(sox.stdin);

    // Stop the recording after 5 minutes
    setTimeout(() => {
        console.log('Stopping recording...');
        rtlFm.kill();
        sox.kill();
    }, 5 * 60 * 1000);
});