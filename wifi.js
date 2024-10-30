// wifi.js

const { exec } = require('child_process');

// Function to check the Wi-Fi connection and connect if not connected
function checkWifiConnection(config) {
    // Check current Wi-Fi connection status
    exec('/usr/bin/nmcli -t -f active,ssid dev wifi', (error, stdout, stderr) => {
        if (error) {
            console.error(`Error checking Wi-Fi connection: ${error.message}`);
            printLCD('unable to connect', 'to WIFI');
            process.exit(1);
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
                        console.error(`Error connecting to Wi-Fi: ${error.message}`);
                        printLCD('unable to connect', 'to WIFI');
                        process.exit(1);
                    } else {
                        console.log('Successfully connected to Wi-Fi');
                    }
                });
            } else {
                console.log('Wi-Fi name not found in config');
                printLCD('unable to connect', 'to WIFI');
                process.exit(1);
            }
        }
    });
}

module.exports = {
    checkWifiConnection
};
