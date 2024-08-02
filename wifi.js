// wifi.js

const { exec } = require('child_process');

// Function to check the Wi-Fi connection and connect if not connected
function checkWifiConnection(config) {
    // Check current Wi-Fi connection status
    exec('/usr/bin/nmcli -t -f active,ssid dev wifi', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking Wi-Fi connection: ${error.message}`);
            return;
        }

        // Determine if connected to any Wi-Fi network
        const connected = stdout.split('\n').some(line => line.startsWith('yes'));

        if (connected) {
            console.log('Connected to Wi-Fi');
        } else {
            // Not connected to Wi-Fi, connect to the Wi-Fi in the config file
            const wifiName = config.wifiName;
            const wifiPassword = config.wifiPassword;

            if (wifiName && wifiPassword) {
                console.log(`Connecting to Wi-Fi: ${wifiName} with password: ${wifiPassword}`);
                const command = `/usr/bin/nmcli device wifi connect "${wifiName}" password "${wifiPassword}"`;
                exec(command, (error, stdout, stderr) => {
                    if (error) {
                        console.error(`Error connecting to Wi-Fi: ${error.message}`);
                    } else {
                        console.log('Successfully connected to Wi-Fi');
                    }
                });
            } else {
                console.log('Wi-Fi credentials not found in config');
            }
        }
    });
}

module.exports = {
    checkWifiConnection
};