#!/bin/bash

# Update PATH to include Node.js binaries
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion

# Exit immediately if a command exits with a non-zero status.
set -e

# Step 1: Purge existing librtlsdr
sudo apt purge -y ^librtlsdr
sudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*

# Step 2: Install dependencies
sudo apt-get update
sudo apt-get install -y libusb-1.0-0-dev git cmake pkg-config libudev-dev sox
# I2C for LCD
sudo apt-get install -y python3-smbus
sudo apt-get install -y i2c-tools
# for wifi detection
sudo apt-get install -y wireless-tools

cd ~

# Step 3: Clone and build rtl-sdr-blog
if [ -d "rtl-sdr-blog" ]; then
    rm -rf rtl-sdr-blog
fi

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

# Step 5: Add cron job for daily restart at 3 AM
(crontab -l 2>/dev/null; echo "0 3 * * * /sbin/shutdown -r now") | sudo crontab -