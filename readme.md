# open-weather automated ground station

## setup

### raspberry pi
+ Install latest [Raspberry Pi OS](https://www.raspberrypi.com/software/). At the time of writing this I am using v12 (Bookworm). It's probably best to stick to this version.
+ Use ```openweather``` for the username.
+ Use ```sudo raspi-config``` to enable SSH.

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
[First install SoapySDR from GitHub](https://github.com/pothosware/SoapyRTLSDR)
[Then follow instructions for the RTLSDR device](https://github.com/pothosware/SoapyRTLSDR/wiki)

To do.. get it working with Python
https://github.com/pothosware/SoapySDR/wiki/PythonSupport
https://gist.github.com/songritk/b0ac5cde818d42d61a9848f3f2a5a797
https://stackoverflow.com/questions/49371699/no-modules-found-when-installing-soapysdr-on-raspberry-pi-3


```bash
python3 -m venv myenv
source myenv/bin/activate
pip install soapysdr

```

Once SoapySDR is installed
```
sudo apt install sox
rtl_fm -f 104.6M -M fm -s 170k -r 32k -A fast -l 0 -E deemp -g 10 | sox -t raw -e signed -c 1 -b 16 -r 32000 - test_rtl.wav
```


#### Node, nvm and NPM

```bash
sudo apt install -y build-essential libssl-dev
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install v18.20.2
```

#### rtl-sdr (not working...)
```bash
git clone https://gitea.osmocom.org/sdr/rtl-sdr.git
cd rtl-sdr/
mkdir build
cd build
cmake ../
make
sudo make install
sudo ldconfig
cmake ../ -DINSTALL_UDEV_RULES=ON
```



#### SDR++ (no longer used)

+ Helpful tip, download the [SDR++ manual here](https://www.sdrpp.org/manual.pdf)

+ As of the time of writing (23 April 2024) there is no binary for 64-bit Raspberry Pi OS, so we have to build it from source.

+ In order to do this quickly and easily, run the install-sdrpp.sh script from this directory

```bash
chmod +x install-sdrpp.sh
./install-sdrpp.sh
```
## helpful links etc
+ [10-day predictions for NOAA-19 satelite pass](https://www.n2yo.com/passes/?s=33591#)
+ [open-weather DIY satellite ground station: workshop resource](https://docs.google.com/document/d/19wAhLYBdl_qCb4kBRlUFztdgenivi1wQb9GiZbTc7fY/edit)
+ [SDR++ manual](https://www.sdrpp.org/manual.pdf)

## other SDR software options...
+ [rfsoapyfile](https://github.com/roseengineering/rfsoapyfile)
+ https://github.com/ha7ilm/csdr
+ [rtl_fm](https://osmocom-sdr.osmocom.narkive.com/lDN2mcET/rtl-fm-problem-with-capture-audio)
+ [rx_tools](https://github.com/rxseger/rx_tools)
+ [AltiWx](https://github.com/altillimity/AltiWx)
+ GNURadio
+ GQRX
+ [more info here...](https://inst.eecs.berkeley.edu/~ee123/fa12/rtl_sdr.html)