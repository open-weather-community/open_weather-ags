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
sudo apt-get install -y libusb-1.0-0-dev git cmake pkg-config libudev-dev

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

# Step 5: Install Python and SWIG
sudo apt-get install -y python-dev-is-python3 swig

# Step 6: Install SoapySDR
sudo apt-get install -y libsoapysdr-dev soapysdr-tools

# Step 7: Clone and build SoapyRTLSDR
if [ -d "SoapyRTLSDR" ]; then
    rm -rf SoapyRTLSDR
fi
git clone https://github.com/pothosware/SoapyRTLSDR.git
cd SoapyRTLSDR
mkdir build
cd build
cmake ..
make
sudo make install
cd ../..

# Step 8: Install build-essential and libssl-dev
sudo apt install -y build-essential libssl-dev

# Step 9: Install NVM and Node.js
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
export NVM_DIR="$HOME/.nvm"
source $NVM_DIR/nvm.sh
nvm install 16.13.2
nvm use 16.13.2

# Ensure NVM and Node.js are available in non-interactive shells
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"' >> ~/.bashrc
echo '[ -s "$NVM_DIR/bash_completion" ] && \. "$NVM_DIR/bash_completion"' >> ~/.bashrc

# Step 10: Install npm and npm packages
npm install npm@latest -g

# Step 11: Install npm packages
npm install chokidar usb-detection node-cron

# Step 12: Install Neovim and set up configuration
sudo apt install -y neovim curl
curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
    https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim
mkdir -p ~/.config/nvim

# Create init.vim file
cat <<EOL > ~/.config/nvim/init.vim
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
map <C-n> :NERDTreeToggle<CR>
EOL

# Install Neovim plugins
nvim +PlugInstall +qall

# Step 13: Set up cron job to start scheduler on reboot
(crontab -l 2>/dev/null || true; echo "@reboot /home/openweather/open_weather-ags/start_scheduler.sh") | crontab -

echo "Installation completed successfully."
