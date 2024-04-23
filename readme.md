# open-weather automated ground station

## setup

### raspberry pi
+ Install latest [Raspberry Pi OS](https://www.raspberrypi.com/software/). At the time of writing this I am using v12 (Bookworm). It's probably best to stick to this version.
+ Use ```openweather``` for the username.
+ Use ```sudo raspi-config``` to enable SSH.

### software

#### RTL-SDR v4

+ According to the [official quick start guide](https://www.rtl-sdr.com/V4/) we must purge existing RTL-SDR drivers and install v4 ones anew.

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
```reboot```

#### SDR++

+ As of the time of writing (23 April 2024) there is no binary for 64-bit Raspberry Pi OS, so we have to build it from source.

+ First install cmake, ninja-build and vcpkg
```bash
cd ~
sudo apt install cmake ninja-build
git clone https://github.com/microsoft/vcpkg
export VCPKG_FORCE_SYSTEM_BINARIES=1 # fix for ARM based systems
./vcpkg/bootstrap-vcpkg.sh
```

Installing vcpkg this way put its files here: /home/openweather/vcpkg/buildtrees/_vcpkg/build

```bash
cmake .. "-DCMAKE_TOOLCHAIN_FILE=/home/openweather/vcpkg/buildtrees/_vcpkg/build/scripts/buildsystems/vcpkg.cmake" -G "Visual Studio 16 2019"
cmake --build . --config Release
```

```bash
git clone https://github.com/AlexandreRouma/SDRPlusPlus.git
cd SDRPlusPlus/
mkdir build
cd build
```

+ Install nightly [SDR++](https://github.com/AlexandreRouma/SDRPlusPlus/releases/download/nightly/sdrpp_debian_bookworm_amd64.deb) and dependencies
```bash
wget https://github.com/AlexandreRouma/SDRPlusPlus/releases/download/nightly/sdrpp_debian_bookworm_amd64.deb
sudo apt install libfftw3-dev libglfw3-dev libvolk2-dev libzstd-dev libairspyhf-dev libiio-dev libad9361-dev librtaudio-dev libhackrf-dev
sudo dpkg -i sdrpp_debian_bookworm_amd64.deb
```
+ Helpful tip, download the [SDR++ manual here](https://www.sdrpp.org/manual.pdf)