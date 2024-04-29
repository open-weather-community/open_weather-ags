const STLSDR = require('stl-sdr');

const sdr = new STLSDR();

const frequency = 96.3e6; // tune to 96.3 MHz
const sampleRate = 2.4e6; // sample rate of 2.4 Msps
const gain = 40; // tuner gain of 40 dB

sdr.open();
sdr.setFrequencyCorrection(0);
sdr.setSampleRate(sampleRate);
sdr.setFrequency(frequency);
sdr.setTunerGain(gain);

const buffer = new Buffer(sampleRate * 2);

// receive samples
sdr.readSync(buffer, buffer.length);

// process samples
for (let i = 0; i < buffer.length; i += 2) {
    const sample = buffer.readInt16LE(i);
    console.log(sample);
}

sdr.close();