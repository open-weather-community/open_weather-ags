#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# Step 1: Purge existing librtlsdr
sudo apt purge -y ^librtlsdr
sudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*

# Step 2: Install dependencies
sudo apt-get update
sudo apt-get install -y libusb-1.0-0-dev git cmake pkg-config

# Step 3: Clone and build rtl-sdr-blog
git clone https://github.com/rtlsdrblog/rtl-sdr-blog
cd rtl-sdr-blog
mkdir build
cd build
cmake ../ -DINSTALL_UDEV_RULES=ON
make
sudo make install
sudo cp ../rtl-sdr.rules /etc/udev/rules.d/
sudo ldconfig
cd ../..

# Step 4: Blacklist old drivers
echo 'blacklist dvb_usb_rtl28xxu' | sudo tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf

# Step 5: Install Python and SWIG
sudo apt-get install -y python-dev-is-python3 swig

# Step 6: Clone and build SoapyRTLSDR
git clone https://github.com/pothosware/SoapyRTLSDR.git
cd SoapyRTLSDR
mkdir build
cd build
cmake ..
make
sudo make install
cd ../..

# Step 7: Install build-essential and libssl-dev
sudo apt install -y build-essential libssl-dev

# Step 8: Install NVM and Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install node

# Step 9: Install npm packages and libudev-dev
npm install chokidar usb-detection
sudo apt update
sudo apt install -y libudev-dev

echo "Installation completed successfully."

