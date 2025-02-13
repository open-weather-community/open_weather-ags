// wifi.js

const { exec } = require('child_process');
const { printLCD } = require('./lcd'); // Assuming you have an lcd module

async function checkWifiConnection(config) {
    return new Promise((resolve, reject) => {
        // Check current Wi-Fi connection status
        exec('/usr/bin/nmcli -t -f active,ssid dev wifi', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error checking Wi-Fi connection: ${error.message}`);
                printLCD('unable to connect', 'to WIFI');
                reject(new Error('Unable to connect to Wi-Fi'));
                return;
            }

            // Determine if connected to any Wi-Fi network
            const connected = stdout.split('\n').some(line => line.startsWith('yes'));

            if (connected) {
                console.log('Connected to Wi-Fi');
                resolve();
            } else {
                // Not connected to Wi-Fi, connect to the Wi-Fi in the config file
                const wifiName = config.wifiName;
                const wifiPassword = config.wifiPassword;

                if (wifiName) {
                    let command = '';
                    if (wifiPassword) {
                        console.log(`Connecting to secured Wi-Fi: ${wifiName}`);
                        command = `/usr/bin/nmcli device wifi connect "${wifiName}" password "${wifiPassword}"`;
                    } else {
                        console.log(`Connecting to open Wi-Fi: ${wifiName}`);
                        command = `/usr/bin/nmcli device wifi connect "${wifiName}"`;
                    }

                    exec(command, (error, stdout, stderr) => {
                        if (error) {
                            let message = error.message || stderr;

                            // Sanitize message: Remove password from nmcli command output
                            message = message.replace(/password\s+"[^"]+"/, 'password "***"');

                            console.error(`Error connecting to Wi-Fi: ${message}`);
                            printLCD('unable to connect', 'to WIFI');
                            reject(new Error('Unable to connect to Wi-Fi'));
                        } else {
                            console.log('Successfully connected to Wi-Fi');
                            resolve();
                        }
                    });

                } else {
                    console.log('Wi-Fi name not found in config');
                    printLCD('unable to connect', 'to WIFI');
                    reject(new Error('Wi-Fi name not found in config'));
                }
            }
        });
    });
}

// function to get this raspberry pi's IP address (on the wifi network)
function getMyIP() {
    return new Promise((resolve, reject) => {
        exec('/sbin/ifconfig wlan0 | grep "inet "', (error, stdout, stderr) => {
            if (error) {
                reject(error);
            } else {
                const ip = stdout.split(' ')[1];
                resolve(ip);
            }
        });
    });
}

module.exports = {
    checkWifiConnection
};
