import numpy as np
import soapysdr
import time
import wave

# Set up SoapySDR device
sdr = soapysdr.Device.make("driver=rtlsdr")

# Set up recording parameters
frequency = 100e6  # tuning frequency in Hz
sample_rate = 2e6  # sample rate in Hz
duration = 10  # recording duration in seconds

# Set up SoapySDR stream
stream = sdr.setupStream([soapysdr.Stream.complex(frequency, sample_rate)])
stream.activate(True)

# Set up WAV file
wav_file = wave.open("radio_recording.wav", "wb")
wav_file.setnchannels(1)
wav_file.setsampwidth(2)
wav_file.setframerate(int(sample_rate))

# Record radio to WAV file
start_time = time.time()
while time.time() - start_time < duration:
    # Read samples from SoapySDR stream
    samples = stream.read(int(sample_rate / 10))

    # Convert samples to 16-bit PCM
    pcm_samples = (np.real(samples) * 32767).astype(np.int16)

    # Write samples to WAV file
    wav_file.writeframes(pcm_samples.tobytes())

# Stop SoapySDR stream and close WAV file
stream.activate(False)
sdr.closeStream(stream)
wav_file.close()
