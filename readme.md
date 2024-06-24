# open-weather automated ground station

## usage

npm start

## Explanation

### Files

#### .env

Hidden file with AUTH_TOKEN property which is assigned to each device by open-weather.

#### config.json

This holds the basic configuration for each ground station. Properties include latitude and longitude, maximum distance from satellite to consider a "good pass", etc.

#### passes.json

This file contains information for upcoming and past NOAA satellite passes. It is updated using tle.js, and a cron job checks every minute in app.js to see if it should be recording based on this info. When it finishes, the recorded flag should be set to true.

#### recordings

WAV files are saved to this directory...

## setup

### raspberry pi
+ Install latest [Raspberry Pi OS](https://www.raspberrypi.com/software/). At the time of writing this I am using v12 (Bookworm). It's probably best to stick to this version.
+ Use ```openweather``` for the username.
+ Use ```sudo raspi-config``` to enable SSH.

### USB Drive

Format to Fat32
```
lsblk # identify disk
sudo mkdir /mnt/o-w
sudo nano /etc/fstab
```
Add to fstab:
```
/dev/sda1  /mnt/o-w  vfat  defaults  0  2
```

Reload and mount the drive
```
systemctl daemon-reload
sudo mount -a
```

### software (quick way)

```bash
git clone git@github.com:prismspecs/open_weather-ags.git
cd open_weather-ags
chmod +x install.sh
./install.sh
```


### software

#### RTL-SDR v4 driver

+ According to the [official quick start guide](https://www.rtl-sdr.com/V4/) we must purge existing RTL-SDR drivers and install v4 ones anew. Note we are using rtl-sdr-blog drivers and not standard rtl-sdr which do not work with v4.

Purge:
```bash
sudo apt purge ^librtlsdr
sudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_* 
```
Install:
```bash
sudo apt-get install libusb-1.0-0-dev git cmake pkg-config
git clone https://github.com/rtlsdrblog/rtl-sdr-blog
cd rtl-sdr-blog
mkdir build
cd build
cmake ../ -DINSTALL_UDEV_RULES=ON
make
sudo make install
sudo cp ../rtl-sdr.rules /etc/udev/rules.d/
sudo ldconfig
```

Backlist old drivers(?):
```bash
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
```

Reboot!
```bash
reboot
```

#### SoapySDR

In broad strokes,
First install SWIG so that the Python bindings are created when you build SoapySDR
```bash
sudo apt-get install python-dev-is-python3 swig
```
[First install SoapySDR from GitHub](https://github.com/pothosware/SoapyRTLSDR) [using the wiki instructions](https://github.com/pothosware/SoapyRTLSDR/wiki)
```
git clone https://github.com/pothosware/SoapyRTLSDR.git
cd SoapyRTLSDR
mkdir build
cd build
cmake ..
make
sudo make install
```

Once SoapySDR is installed, test FM recording
```bash
sudo apt install sox
rtl_fm -f 104.6M -M fm -s 170k -r 32k -A fast -l 0 -E deemp -g 10 | sox -t raw -e signed -c 1 -b 16 -r 32000 - fm104-6.wav # FM radio station in Berlin
rtl_fm -f 137.1M -M fm -s 15k -r 15k -A fast -l 0 -E deemp -g 10 | sox -t raw -e signed -c 1 -b 16 -r 15000 - noaa19.wav # NOAA19

```

#### Node, nvm and NPM

```bash
sudo apt install -y build-essential libssl-dev
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install node
```

Then install ...
```bash
npm install chokidar usb-detection
sudo apt update
sudo apt install libudev-dev
```

## helpful links etc
+ [10-day predictions for NOAA-19](https://www.n2yo.com/passes/?s=33591#)
+ [10-day predictions for NOAA-18](https://www.n2yo.com/passes/?s=28654&a=1)
+ [10-day predictions for NOAA-15](https://www.n2yo.com/passes/?s=25338)
+ [open-weather DIY satellite ground station: workshop resource](https://docs.google.com/document/d/19wAhLYBdl_qCb4kBRlUFztdgenivi1wQb9GiZbTc7fY/edit)
+ [SDR++ manual](https://www.sdrpp.org/manual.pdf)

