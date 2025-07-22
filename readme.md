# Open-Weather Automated Ground Station (AGS)

An open-source hardware and software project for autonomous weather satellite reception from NOAA satellites using Automatic Picture Transmission (APT). This project enables distributed collection of weather satellite imagery for the open-weather Public Archive.

## Overview

The Open-Weather AGS is designed to be:
- **Autonomous** - Operates without manual intervention
- **Educational** - Entry point for learning about satellites, radio, and weather
- **Resilient** - Graceful handling of failures and network issues
- **Open Source** - All hardware designs, software, and documentation freely available

## Quick Start

If you have a fully assembled AGS:

1. Edit the `ow-config.json` file on the USB drive with your station details
2. Insert the USB drive into your AGS
3. Power on the device
4. The system will automatically start receiving satellite passes

To manually start the application:
```bash
npm start
```

To validate your system setup:
```bash
npm run validate
```

## Configuration

Create (or edit) a file named `ow-config.json` on your USB drive. Here's the configuration template:

```json
{
  "wifiName": "your_wifi_network",
  "wifiPassword": "your_wifi_password",
  "auth_token": "your_openweather_api_token",
  "myID": 1,
  "locLat": 52.49548,
  "locLon": 13.46843,
  "gain": 38,
  "maxDistance": 2200000,
  "daysToPropagate": 1,
  "minElevation": 30,
  "bufferMinutes": 0,
  "numberOfPassesPerDay": 1,
  "sampleRate": "48k",
  "downsample": true,
  "noaaFrequencies": {
    "NOAA 19": "137.1M",
    "NOAA 15": "137.62M"
  },
  "passesFile": "passes.json",
  "saveDir": "/media/openweather/ow",
  "logFile": "log.txt",
  "rtl_fm_path": "/usr/local/bin/rtl_fm",
  "sox_path": "/usr/bin/sox"
}
```

### Essential Configuration Parameters

The following settings are the most important to configure for your station:

- **`myID`** - Unique station identifier (provided by open-weather)
- **`locLat`** / **`locLon`** - Your station's latitude and longitude (decimal degrees)
- **`wifiName`** / **`wifiPassword`** - Your WiFi network credentials
- **`auth_token`** - Your open-weather API authentication token
- **`gain`** - RTL-SDR gain setting (adjust based on signal quality)

### Advanced Configuration

- **`maxDistance`** - Maximum satellite distance in meters to consider a viable pass
- **`daysToPropagate`** - Days in advance to calculate satellite passes
- **`minElevation`** - Minimum pass elevation in degrees (higher = better signal quality)
- **`bufferMinutes`** - Recording buffer time before/after calculated pass times
- **`numberOfPassesPerDay`** - Maximum number of recordings per day

**Note:** NOAA-18 has been removed from the default configuration as it reached end-of-life in 2024 and is no longer operational.

## System Architecture

### Core Components

- **`scheduler.js`** - Main application orchestrator and recording scheduler
- **`config.js`** - Configuration management with backup/recovery system
- **`tle.js`** - Two-Line Element data processing and satellite pass calculation
- **`recorder.js`** - Automated satellite signal recording using RTL-SDR
- **`upload.js`** - Data transmission to open-weather Public Archive
- **`network.js`** - Network connectivity management with ethernet priority
- **`lcd.js`** - LCD display interface for status and error messages
- **`logger.js`** - Centralized logging with file rotation

### File Structure

```
/home/openweather/open_weather-ags/     # Main application directory
├── scheduler.js                        # Main entry point
├── config.js                          # Configuration management
├── *.js                               # Other core modules
└── 3d/                                # 3D printing files
    ├── ready-to-print/
    └── design-and-archive/

/media/[usb-device]/                    # USB storage
├── ow-config.json                      # Station configuration
├── ow-config-backup.json              # Automatic backup
├── passes.json                         # Calculated satellite passes
├── log.txt                            # System logs
└── recordings/                         # Captured audio files
```

## Setup

Regardless of whether or not you use the automatic install vs. a manual install, some things must be prepped on the Raspberry Pi first.

### Raspberry Pi interfaces
+ Install latest [Raspberry Pi OS](https://www.raspberrypi.com/software/). At the time of writing this I am using v12 (Bookworm). It's probably best to stick to this version.
+ Use ```openweather``` for the username.
+ Enable SSH and I2C
```bash
sudo raspi-config
# then Interface, then see SSH and I2C options
```
You can test I2C with:
```bash
sudo i2cdetect -y 1
```
This will give you the address (likely 0x27) which should be used when initializing the device in the node project.

### Create an ssh key for the raspberry pi and add it to github as a deploy key

```sh
ssh-keygen
```

This will grant access to repo pushing rights, so probably not relevant to most (or any) other people.

### Software (quick way -- manual instructions below)

```sh
bash <(curl -s https://gist.githubusercontent.com/prismspecs/17b3a23be1fc6afe79f2788c9797bd21/raw/f21a18a964146081f2a6e9c3b4b80c783bbe24b7/open-weather_installer.sh)
```

```bash
git clone https://github.com/open-weather-community/open_weather-ags.git
cd open_weather-ags
chmod +x install.sh
./install.sh
npm install
```

## Manual Updates

If you need to manually update your AGS to a specific version or development branch, follow these steps:

### 1. Bypass Automatic Version Control

The AGS will automatically download the "regular" version when it boots UNLESS there is a file in your home directory named `bypass-version-check`. Create this file:

```bash
touch ~/bypass-version-check
```

This allows you to continue using the test version straight from GitHub without the system trying to correct itself. To return the AGS to normal automatic updates, simply rename or remove that file.

**Note:** The file does not have an extension (like .txt).

### 2. Remove Current AGS Directory

Remove the existing AGS installation:

```bash
rm -rf ~/open_weather-ags/
```

### 3. Clone the Repository

Clone the desired version from GitHub:

```bash
cd ~
git clone https://github.com/open-weather-community/open_weather-ags.git
```

### 4. Reboot

Restart the system to apply changes:

```bash
reboot
```

After reboot, the system will use your manually installed version instead of automatically updating.

### crontab rebooting

Using sudo, schedule a reboot every morning for 3am
```bash
sudo crontab -e
0 3 * * * /sbin/shutdown -r now
```

### set time to UTC and enable NTP
```sh
timedatectl set-ntp true
timedatectl set-timezone "UTC"
```

### Policy for user to do networking

Since the app needs to connect to wifi networks based on the config file, we need to give the user the necessary permissions to do so.

```sh
sudo nano /etc/polkit-1/localauthority/50-local.d/x.pkla
```

```
[Allow specific user to modify network settings]
Identity=unix-user:openweather
Action=org.freedesktop.NetworkManager.settings.modify.system
ResultAny=yes
```

```sh
sudo systemctl restart polkit
```

NOTE: I don't think this one is actually important, try to skip it
```sh
sudo nano /etc/polkit-1/rules.d/80-network-manager.rules
```

```
polkit.addRule(function(action, subject) {
    if (action.id.indexOf("org.freedesktop.NetworkManager.") === 0 &&
        subject.user == "openweather") {
        return polkit.Result.YES;
    }
});
```

```sh
sudo systemctl restart NetworkManager
```

### USB Drive

Make sure to format whatever USB drive you use as a FAT (or FAT32) drive. The application should automatically detect whatever drive you plug in, so adjusting the mount point, etc. below is optional. These instructions may also be out of date, and I have bricked my install by running fstab improperly before, so be careful.

Format to Fat32 (not sure about these instructions)
```bash
sudo umount /dev/sda1
sudo mkfs.vfat -F 32 -n 'o-w' /dev/sda
sudo chown -R openweather:openweather /media/o-w/
```

```bash
lsblk # identify disk
sudo mkdir /mnt/o-w
sudo nano /etc/fstab
```
Add to fstab:
```
/dev/sda1  /mnt/o-w  vfat  defaults,uid=1000,gid=1000  0  2
```

Reload and mount the drive
```
systemctl daemon-reload
sudo mount -a
```





### Check that it is working
```bash
nvim /home/openweather/cronlog.txt
```

### software (manual way)

#### crontab
This ensures that the node project starts upon reboot.

```
crontab -e
```
```
@reboot /home/openweather/open_weather-ags/start_scheduler.sh
```


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
```

#### Node, nvm and NPM

```bash
sudo apt install -y build-essential libssl-dev
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"  
[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"
nvm install 16.13.2
nvm use 16.13.2
```

Then install ...
```bash
npm install chokidar usb-detection
sudo apt update
sudo apt install libudev-dev
```

#### Raspberry Pi misc setup

##### Nvim
```
sudo apt update
sudo apt install neovim curl
curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
    https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
mkdir -p ~/.config/nvim
nano ~/.config/nvim/init.vim
```

init.vm:
```
" Specify a directory for plugins
call plug#begin('~/.local/share/nvim/plugged')

" Add plugins here
Plug 'morhetz/gruvbox' " Gruvbox theme
Plug 'junegunn/fzf', { 'do': { -> fzf#install() } } " Fuzzy finder
Plug 'junegunn/fzf.vim' " FZF Vim integration
Plug 'tpope/vim-sensible' " Basic sensible settings

Plug 'neoclide/coc.nvim', {'branch': 'release'}
Plug 'preservim/nerdtree'
Plug 'vim-airline/vim-airline'
Plug 'vim-airline/vim-airline-themes'
Plug 'sheerun/vim-polyglot'
Plug 'sbdchd/neoformat'

" Initialize plugin system
call plug#end()

let g:neoformat_enabled_javascript = ['prettier']

" Enable Gruvbox theme
syntax enable
set background=dark
colorscheme gruvbox

" Basic settings
set number " Show line numbers
set relativenumber " Show relative line numbers
set tabstop=4 " Number of spaces that a <Tab> in the file counts for
set shiftwidth=4 " Number of spaces to use for each step of (auto)indent
set expandtab " Use spaces instead of tabs
set smartindent " Smart auto-indenting
set clipboard=unnamedplus " Use the system clipboard
set mouse=a " Enable mouse support

" Key binding to toggle NERDTree
map <C-n> :Ntree<CR>
```

## helpful links etc
+ [10-day predictions for NOAA-19](https://www.n2yo.com/passes/?s=33591#)
+ [10-day predictions for NOAA-15](https://www.n2yo.com/passes/?s=25338)
+ ~~[10-day predictions for NOAA-18](https://www.n2yo.com/passes/?s=28654&a=1)~~ *(NOAA-18 end-of-life)*
+ [open-weather DIY satellite ground station: workshop resource](https://docs.google.com/document/d/19wAhLYBdl_qCb4kBRlUFztdgenivi1wQb9GiZbTc7fY/edit)
+ [SDR++ manual](https://www.sdrpp.org/manual.pdf)

## Network Management

The AGS includes comprehensive network management that prioritizes ethernet connections over WiFi and displays connection status on the LCD.

### Features

- **Automatic Interface Detection**: Detects ethernet (eth0, enp*, enx*) and WiFi (wlan0, wlp*) interfaces across different Linux distributions
- **Connection Priority**: Ethernet (highest priority) → WiFi (fallback) → Automatic failover
- **LCD Status Display**: Shows connection type and full IP address, updates every 5 minutes
- **Internet Connectivity Verification**: Tests actual internet access using ping to Google DNS (8.8.8.8)

### Network Status Messages

**LCD Display Messages:**
- `ETHERNET ACTIVE` / `IP: 192.168.1.100` - Ethernet connected with internet
- `WIFI ACTIVE` / `IP: 192.168.1.101` - WiFi connected with internet  
- `ETHERNET: Local only` - Ethernet connected but no internet
- `WIFI: Local only` - WiFi connected but no internet
- `NO NETWORK` / `CHECK CABLES` - No active connections

### Configuration

**WiFi Configuration** (in `ow-config.json`):
```json
{
  "wifiName": "YourNetworkName",
  "wifiPassword": "YourPassword"
}
```

**Ethernet Configuration**: Uses DHCP by default, no configuration needed. The system automatically detects interfaces and sets routing priority.

### Network Monitoring

The system automatically:
1. Checks ethernet connection first (highest priority)
2. Falls back to WiFi if ethernet unavailable
3. Displays status on LCD with full IP address
4. Monitors connections every 5 minutes
5. Handles connection failures gracefully

### Troubleshooting Network Issues

**Common Network Commands:**
```bash
# Check interface status
ip link show                    # Show all interfaces
ip addr show                    # Show IP addresses
ip route show                   # Show routing table

# Test connectivity
ping -c 3 8.8.8.8              # Test internet connectivity
ping -c 3 192.168.1.1          # Test local gateway

# NetworkManager commands
nmcli device status             # Show device status
nmcli connection show           # Show connections
nmcli device wifi list          # Show available WiFi networks
```

**Interface Detection Issues:**
- Network interface names vary between systems (eth0, enp*, wlan0, wlp*)
- The system auto-detects interfaces, but you can check available interfaces with `ip link show`
- If ethernet isn't taking priority, NetworkManager may override routing (system attempts automatic priority setting)

**WiFi Connection Problems:**
1. Verify WiFi credentials in config file
2. Check WiFi signal strength
3. Ensure network is broadcasting SSID
4. Check for "No internet despite connection" - system distinguishes between local and internet connectivity

## Troubleshooting

### System Validation

First, run the system validation script to check for common setup issues:

```bash
npm run validate
```

This checks for:
- Node.js version compatibility
- Required system dependencies (rtl-sdr, sox, git)
- Hardware interfaces (I2C for LCD)
- File structure integrity
- Network tools availability

### USB/WiFi Stability Tool

Run the built-in USB stability tool to check for interference issues:

```bash
npm run usb-stability check
```

This checks for:
- USB device enumeration and interference detection
- WiFi connection stability during USB operations
- Power optimization recommendations
- Hardware compatibility issues

### Common Issues & Solutions

#### "Updating Passes" Freeze

**Symptoms:** LCD displays "updating passes" and system becomes unresponsive

**Solutions:**
1. Restart the system - improved timeout handling should prevent freeze
2. Run diagnostic tool to verify DNS and network connectivity
3. Check logs for specific error messages (EAI_AGAIN, ENOTFOUND, timeout)
4. System should automatically use cached TLE data if network fails

#### DNS Resolution Failures

**Symptoms:** "EAI_AGAIN celestrak.org" or "ENOTFOUND" errors in logs

**Solutions:**
1. Check DNS resolution with `nslookup celestrak.org`
2. Verify WiFi credentials and network settings in config
3. Restart network: `sudo systemctl restart NetworkManager`
4. Check USB/WiFi interference with `npm run usb-stability check`

#### Common Startup Issues

**Symptoms:** "Config missing!" or "config error" on LCD

**Solutions:**
1. Check for backup config file (`ow-config-backup.json`) on USB drive
2. System automatically attempts restoration from backup
3. Verify USB drive is properly inserted and mounted
4. Ensure `ow-config.json` contains valid JSON syntax

#### USB/WiFi Interference

**Symptoms:** WiFi disconnections when USB drive is inserted, poor signal quality

**Solutions:**
1. Run interference test: `npm run usb-stability check`
2. Use powered USB hub to reduce Pi power load
3. Use USB 3.0 devices instead of USB 2.0 (different frequency band)
4. Physically separate USB devices from WiFi antenna
5. Use shielded USB cables
6. Switch to 5GHz WiFi networks to avoid 2.4GHz interference

## Development

### Code Structure

The codebase follows a modular architecture with clear separation of concerns:

- **Core modules** (`scheduler.js`, `config.js`, etc.) - Main application logic
- **Hardware interfaces** (`lcd.js`, `recorder.js`) - Hardware abstraction
- **Network services** (`network.js`, `upload.js`) - Network operations  
- **Utilities** (`utils.js`, `constants.js`) - Shared functionality
- **Diagnostics** (`usb-stability.js`) - System health monitoring

### Configuration Management

The system implements robust configuration handling:
- **Atomic writes** - Prevents corruption during power loss
- **Automatic backups** - Creates backup copies for recovery
- **Validation** - Ensures configuration integrity
- **Multi-location search** - Finds configs across mount points

### Error Handling

Comprehensive error handling includes:
- **Network error detection** - Graceful fallback to cached data
- **Timeout protection** - Prevents hanging operations
- **Automatic recovery** - Self-healing from common failures
- **User feedback** - Clear error messages on LCD display

## Contributing

We welcome contributions! Please:

1. **Fork the repository** and create a feature branch
2. **Follow the existing code style** and add JSDoc documentation
3. **Test on actual hardware** - Pi development environment preferred
4. **Update documentation** for any user-facing changes
5. **Submit a pull request** with clear description of changes

### Development Environment

This project is designed for cross-platform development:
- **Development machine** - For coding and version control
- **Raspberry Pi target** - For testing hardware-specific features
- **Remote deployment** - Git-based synchronization workflow

### Code Quality

- Use **JSDoc** for function documentation
- Follow **modular design** principles
- Implement **proper error handling**
- Add **logging** for debugging and monitoring
- **Validate inputs** to prevent runtime errors

## License

ISC License - See repository for details.

## Support

- **GitHub Issues** - Bug reports and feature requests
- **Documentation** - See `plan.md` for detailed technical information
- **Community** - Join the open-weather community discussions
3. Create new `ow-config.json` file on USB drive if no backup available
4. Verify USB drive is properly mounted and accessible

#### USB Drive Issues

**Symptoms:** USB drive detected but config not found

**Solutions:**
1. Ensure USB drive is formatted as FAT32 with label "O-W"
2. Check that `ow-config.json` is in the root directory of the USB drive
3. Try manually mounting: `sudo mount /dev/sda2 /media/openweather/O-W`
4. Check USB drive health and reformat if necessary

### Log File Locations

**Primary Logs:**
- USB Drive: `/media/openweather/O-W/log.txt` (when writable)
- Fallback: `/home/openweather/logs/log.txt` (when USB read-only)
- System Log: `/home/openweather/cronlog.txt` (startup and system events)

**Checking Logs:**
```bash
# System startup logs
tail -f /home/openweather/cronlog.txt

# Application logs (check both locations)
tail -f /home/openweather/logs/log.txt
tail -f /media/openweather/O-W/log.txt
```
