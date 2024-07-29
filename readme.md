# open-weather automated ground station

## Usage

If you have a fully assembled AGS, just plug it in after editing the ow-config.json file on the USB using a laptop or desktop you have handy.

Assuming you have installed the project, the start_scheduler.sh script will be added as a cron job, which will automatically launch the app at startup.

To start the node project manually:
```sh
npm start
```

## Adjusting the config

Create a file (or edit an existing one) named ow-config.json. Here is a template:

```json
{
	"wifiName": "your wifi network name",
	"wifiPassword": "password",
    "myID": 1,
    "locLat": 52.495480,
    "locLon": 13.468430,
    "gain": 38.0,
    "maxDistance": 2200000,
    "daysToPropagate": 7,
    "minElevation": 30,
    "bufferMinutes": 3,
    "noaaFrequencies": {
        "NOAA 19": "137.1M",
        "NOAA 18": "137.9125M",
        "NOAA 15": "137.62M"
    },
    "passesFile": "passes.json",
    "saveDir": "/mnt/o-w",
    "logFile": "log.txt",
    "rtl_fm_path": "/usr/local/bin/rtl_fm",
    "sox_path": "/usr/bin/sox"
}

```

The only settings you should really need to adjust are above noaaFrequencies in the config file. The rest is for advanced use. You should change the ID based on what open-weather provides you, and find your lat/long and enter those as well. The gain can be adjusted depending on the quality of the recordings. maxDistance is the maximum distance in meters (to the satelite from your location) to be considered a viable pass. daysToPropagate is how many dates in advance your device should predict NOAA passes. bufferMinutes gives a little buffer before and after the pass of X minutes.

## Explanation

### Files

#### .env

Hidden file with AUTH_TOKEN property which is assigned to each device by open-weather.

#### ow-config.json

This holds the basic configuration for each ground station. Properties include latitude and longitude, maximum distance from satellite to consider a "good pass", etc.

#### recordings

WAV files are stored to the recordings/ directory wherever the ow-config.json file is found.

#### passes.json

This file contains information for upcoming and past NOAA satellite passes. It is updated using tle.js, and a cron job checks every minute in app.js to see if it should be recording based on this info. When it finishes, the recorded flag should be set to true.

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

### crontab rebooting

Using sudo, schedule a reboot every morning for 3am
```bash
sudo crontab -e
0 3 * * * /sbin/shutdown -r now
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

### Create an ssh key for the raspberry pi and add it to github as a deploy key

```sh
ssh-keygen
```

### Software (quick way -- manual instructions below)

```bash
git clone https://github.com/prismspecs/open_weather-ags.git
cd open_weather-ags
chmod +x install.sh
./install.sh
```

Sometimes the installer hangs after NVM instructions so I run it twice.


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
+ [10-day predictions for NOAA-18](https://www.n2yo.com/passes/?s=28654&a=1)
+ [10-day predictions for NOAA-15](https://www.n2yo.com/passes/?s=25338)
+ [open-weather DIY satellite ground station: workshop resource](https://docs.google.com/document/d/19wAhLYBdl_qCb4kBRlUFztdgenivi1wQb9GiZbTc7fY/edit)
+ [SDR++ manual](https://www.sdrpp.org/manual.pdf)
