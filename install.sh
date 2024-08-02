#!/bin/bash

echo "Beginning installer"

# Exit immediately if a command exits with a non-zero status.
set -e

# Load NVM (Node Version Manager)
load_nvm() {
    export NVM_DIR="$HOME/.nvm"
    [ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  # This loads nvm
    [ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"  # This loads nvm bash_completion
}

# Purge existing librtlsdr
purge_librtlsdr() {
    sudo apt purge -y ^librtlsdr
    sudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*
}

# Install dependencies
install_dependencies() {
    sudo apt-get update
    sudo apt-get install -y libusb-1.0-0-dev git cmake pkg-config libudev-dev sox
    sudo apt-get install -y python3-smbus i2c-tools wireless-tools
}

# Clone and build rtl-sdr-blog
build_rtl_sdr_blog() {
    cd ~
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
}

# Blacklist old drivers
blacklist_old_drivers() {
    echo 'blacklist dvb_usb_rtl28xxu' | sudo tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
}

# Add cron job for daily restart at 3 AM
add_cron_job() {
    (sudo crontab -l 2>/dev/null; echo "0 3 * * * /sbin/shutdown -r now") | sudo crontab -
}

# Allow specific user to modify network settings
configure_polkit() {
    sudo bash -c 'cat > /etc/polkit-1/localauthority/50-local.d/x.pkla <<EOF
[Allow specific user to modify network settings]
Identity=unix-user:openweather
Action=org.freedesktop.NetworkManager.settings.modify.system
ResultAny=yes
EOF'
    sudo systemctl restart polkit
}

# Main script execution
main() {
    load_nvm
    purge_librtlsdr
    install_dependencies
    build_rtl_sdr_blog
    blacklist_old_drivers
    add_cron_job
    configure_polkit
}

# Run the main function
main