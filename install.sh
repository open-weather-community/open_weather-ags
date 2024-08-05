#!/bin/bash

echo "Installing open-weather automated ground station..."

# Exit immediately if a command exits with a non-zero status.
set -e

# Install NVM (Node Version Manager)
install_nvm() {
    echo "Installing NVM..."
    curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.1/install.sh | bash
}

# Load NVM (Node Version Manager) and install Node.js v22.3.0
load_nvm() {
    echo "Loading NVM..."
    export NVM_DIR="$HOME/.nvm"
    if [ -s "$NVM_DIR/nvm.sh" ]; then
        . "$NVM_DIR/nvm.sh"
    else
        echo "NVM script not found!"
        exit 1
    fi
    if [ -s "$NVM_DIR/bash_completion" ]; then
        . "$NVM_DIR/bash_completion"
    else
        echo "NVM bash_completion not found!"
        exit 1
    fi

    # Install and use Node.js v22.3.0
    echo "Installing Node.js v22.3.0..."
    nvm install 22.3.0
    nvm use 22.3.0
    nvm alias default 22.3.0

    # export the NVM_DIR and load NVM in .bashrc
    echo "export NVM_DIR=\"$HOME/.nvm\"" >> ~/.bashrc
}

# Purge existing librtlsdr
purge_librtlsdr() {
    echo "Purging existing librtlsdr..."
    sudo apt purge -y ^librtlsdr
    sudo rm -rvf /usr/lib/librtlsdr* /usr/include/rtl-sdr* /usr/local/lib/librtlsdr* /usr/local/include/rtl-sdr* /usr/local/include/rtl_* /usr/local/bin/rtl_*
}

# Install dependencies
install_dependencies() {
    echo "Installing dependencies..."
    sudo apt-get update
    sudo apt-get install -y libusb-1.0-0-dev git cmake pkg-config libudev-dev sox
    sudo apt-get install -y python3-smbus i2c-tools wireless-tools
}

# Clone and build rtl-sdr-blog
build_rtl_sdr_blog() {
    echo "Cloning and building rtl-sdr-blog..."
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
    echo "Blacklisting old drivers..."
    echo 'blacklist dvb_usb_rtl28xxu' | sudo tee --append /etc/modprobe.d/blacklist-dvb_usb_rtl28xxu.conf
}

add_cron_jobs() {
    # Add cron job for daily restart at 3 AM
    echo "Adding cron job for daily restart at 3 AM..."
    (sudo crontab -l 2>/dev/null; echo "0 3 * * * /sbin/shutdown -r now") | sudo crontab -

    # Add cron job to run start_scheduler.sh on boot (as openweather user)
    echo "Adding cron job to run start_scheduler.sh on boot..."
    (crontab -l 2>/dev/null; echo "@reboot /bin/bash /home/openweather/open_weather-ags/start_scheduler.sh") | crontab -
}

# Allow specific user to modify network settings
configure_polkit() {
    echo "Configuring polkit..."
    sudo bash -c 'cat > /etc/polkit-1/localauthority/50-local.d/x.pkla <<EOF
[Allow specific user to modify network settings]
Identity=unix-user:openweather
Action=org.freedesktop.NetworkManager.settings.modify.system
ResultAny=yes
EOF'
    sudo systemctl restart polkit

    # to check this... nmcli general permissions
}

# Install Neovim and configure it
install_neovim() {
    echo "Installing Neovim and configuring it..."

    # Update package list and install Neovim and curl
    sudo apt update
    sudo apt install -y neovim curl

    # Install vim-plug for Neovim
    curl -fLo ~/.local/share/nvim/site/autoload/plug.vim --create-dirs \
        https://raw.githubusercontent.com/junegunn/vim-plug/master/plug.vim

    # Create Neovim configuration directory
    mkdir -p ~/.config/nvim

    # Create init.vim with the provided configuration
    cat <<EOF > ~/.config/nvim/init.vim
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

" Get rid of annoying error
let g:coc_disable_startup_warning = 1
EOF

    # Install plugins
    nvim +PlugInstall +qall
}

# Main script execution
main() {
    install_nvm
    load_nvm
    purge_librtlsdr
    install_dependencies
    build_rtl_sdr_blog
    blacklist_old_drivers
    add_cron_jobs
    configure_polkit
    install_neovim
}

# Run the main function
main