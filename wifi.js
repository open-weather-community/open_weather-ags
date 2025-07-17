// wifi.js

const { exec } = require('child_process');
const { promisify } = require('util');
const { printLCD } = require('./lcd'); // Assuming you have an lcd module

const execAsync = promisify(exec);

// Function to reset wifi interface and clean up connections
async function resetWifiInterface() {
    try {
        console.log('Resetting wifi interface...');

        // More gentle reset - don't turn radio off/on which can interfere with interface detection
        await execAsync('/usr/bin/nmcli device disconnect wlan0');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

        // Just restart NetworkManager instead of radio cycling
        try {
            await execAsync('sudo systemctl restart NetworkManager');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait longer for NetworkManager to stabilize
        } catch (nmError) {
            console.log('Could not restart NetworkManager, trying radio reset as fallback');
            // Fallback to original method only if NetworkManager restart fails
            await execAsync('/usr/bin/nmcli radio wifi off');
            await new Promise(resolve => setTimeout(resolve, 2000));
            await execAsync('/usr/bin/nmcli radio wifi on');
            await new Promise(resolve => setTimeout(resolve, 3000));
        }

        console.log('Wifi interface reset completed');
        return true;
    } catch (error) {
        console.error(`Error resetting wifi interface: ${error.message}`);
        return false;
    }
}

// Function to clean up existing wifi connections
async function cleanupWifiConnections(targetSSID) {
    try {
        console.log('Cleaning up existing wifi connections...');

        // Get list of all connection profiles
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f name,type connection show');
        const connections = stdout.split('\n').filter(line => line.includes(':802-11-wireless'));

        // Remove old connections to the same SSID to avoid conflicts
        for (const connection of connections) {
            const connectionName = connection.split(':')[0];
            if (connectionName === targetSSID) {
                try {
                    await execAsync(`/usr/bin/nmcli connection delete "${connectionName}"`);
                    console.log(`Deleted existing connection profile: ${connectionName}`);
                } catch (deleteError) {
                    console.log(`Could not delete connection ${connectionName}: ${deleteError.message}`);
                }
            }
        }

        // Disconnect from any active connections
        try {
            await execAsync('/usr/bin/nmcli device disconnect wlan0');
            console.log('Disconnected from current wifi network');
        } catch (disconnectError) {
            console.log('No active connection to disconnect from');
        }

        return true;
    } catch (error) {
        console.error(`Error cleaning up wifi connections: ${error.message}`);
        return false;
    }
}

// Function to scan for available networks
async function scanForNetwork(targetSSID, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Scanning for network "${targetSSID}" (attempt ${attempt}/${maxRetries})...`);

            // Trigger a fresh scan
            await execAsync('/usr/bin/nmcli device wifi rescan');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for scan to complete

            // Check if target network is visible and also log all available networks for debugging
            const { stdout } = await execAsync('/usr/bin/nmcli -t -f ssid device wifi list');
            const networks = stdout.split('\n').filter(line => line.trim());

            // Log available networks for debugging (first 10 to avoid log spam)
            console.log(`Available networks (showing first 10): ${networks.slice(0, 10).join(', ')}`);

            // Check for exact match first
            if (networks.includes(targetSSID)) {
                console.log(`Network "${targetSSID}" found in scan`);
                return true;
            }

            // Also check for similar networks (in case of slight name differences)
            const similarNetworks = networks.filter(network =>
                network.includes('Fibertel') ||
                network.toLowerCase().includes(targetSSID.toLowerCase().substring(0, 8))
            );

            if (similarNetworks.length > 0) {
                console.log(`Similar networks found: ${similarNetworks.join(', ')}`);
                console.log(`Target network "${targetSSID}" not found exactly, but similar networks exist`);
            }

            console.log(`Network "${targetSSID}" not found, waiting before retry...`);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        } catch (error) {
            console.error(`Scan attempt ${attempt} failed: ${error.message}`);
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 3000));
            }
        }
    }

    console.log(`Network "${targetSSID}" not found after ${maxRetries} scan attempts`);
    return false;
}

// Function to verify wifi connection is working
async function verifyWifiConnection() {
    try {
        // Check if we're connected to any wifi network
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const isConnected = stdout.split('\n').some(line => line.startsWith('yes'));

        if (!isConnected) {
            return false;
        }

        // Try to ping a reliable server to verify internet connectivity
        try {
            await execAsync('ping -c 1 -W 5 8.8.8.8');
            return true;
        } catch (pingError) {
            console.log('Connected to wifi but no internet access');
            return true; // Still consider this a successful wifi connection
        }

    } catch (error) {
        console.error(`Error verifying wifi connection: ${error.message}`);
        return false;
    }
}

// Function to attempt wifi connection with retries
async function connectToWifi(wifiName, wifiPassword, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Connecting to "${wifiName}" (attempt ${attempt}/${maxRetries})...`);

            let command;
            if (wifiPassword) {
                command = `/usr/bin/nmcli device wifi connect "${wifiName}" password "${wifiPassword}"`;
            } else {
                command = `/usr/bin/nmcli device wifi connect "${wifiName}"`;
            }

            const { stdout } = await execAsync(command);
            console.log(`Connection successful: ${stdout}`);

            // Give more time for connection to stabilize before verification
            await new Promise(resolve => setTimeout(resolve, 5000));
            const isConnected = await verifyWifiConnection();

            if (isConnected) {
                console.log('Wifi connection verified successfully');
                return true;
            } else {
                console.log('Connection appeared successful but verification failed');
                // Only cleanup on failed verification if we have more attempts
                if (attempt < maxRetries) {
                    console.log('Cleaning up failed connection before retry...');
                    await cleanupWifiConnections(wifiName);
                    await new Promise(resolve => setTimeout(resolve, 3000));
                }
            }

        } catch (error) {
            let message = error.message || error.stderr || 'Unknown error';

            // Sanitize message: Remove password from nmcli command output
            message = message.replace(/password\s+"[^"]+"/, 'password "***"');

            console.error(`Connection attempt ${attempt} failed: ${message}`);

            if (attempt < maxRetries) {
                console.log(`Waiting before retry attempt ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 8000)); // Longer wait between retries
            }
        }
    }

    return false;
}

async function checkWifiConnection(config) {
    try {
        printLCD('checking wifi', 'connection...');

        // First, check if we're already connected to the target network
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));

        if (activeConnections.length > 0) {
            const currentSSID = activeConnections[0].split(':')[1];
            if (currentSSID === config.wifiName) {
                console.log(`Already connected to target network: ${config.wifiName}`);

                // Verify the connection is working
                const isVerified = await verifyWifiConnection();
                if (isVerified) {
                    console.log('Current wifi connection verified');
                    return;
                }
                console.log('Current connection failed verification, reconnecting...');
            } else {
                console.log(`Connected to different network: ${currentSSID}, switching to: ${config.wifiName}`);
            }
        } else {
            console.log('No active wifi connection detected');
        }

        // If we reach here, we need to connect/reconnect
        const wifiName = config.wifiName;
        const wifiPassword = config.wifiPassword;

        if (!wifiName) {
            console.error('Wi-Fi name not found in config');
            printLCD('config error', 'no wifi name');
            throw new Error('Wi-Fi name not found in config');
        }

        printLCD('connecting to', wifiName.substring(0, 16)); // Truncate for LCD display

        // Step 1: Only reset wifi interface if we're not already connected or connection failed verification
        console.log('Step 1: Checking if wifi interface reset is needed...');
        const needsReset = (activeConnections.length === 0) ||
            (activeConnections.length > 0 && activeConnections[0].split(':')[1] !== wifiName);

        if (needsReset) {
            console.log('Resetting wifi interface for clean state...');
            await resetWifiInterface();
        } else {
            console.log('WiFi interface appears to be in good state, skipping reset');
        }

        // Step 2: Clean up existing connections only if needed
        console.log('Step 2: Checking if connection cleanup is needed...');
        if (needsReset || activeConnections.length === 0) {
            console.log('Cleaning up existing connections...');
            await cleanupWifiConnections(wifiName);
        } else {
            console.log('Skipping connection cleanup - interface appears stable');
        }

        // Step 3: Scan for target network
        console.log('Step 3: Scanning for target network...');
        const networkFound = await scanForNetwork(wifiName);
        if (!networkFound) {
            console.error(`Target network "${wifiName}" not found in scans`);
            printLCD('network not found', wifiName.substring(0, 16));
            throw new Error(`Wi-Fi network "${wifiName}" not found`);
        }

        // Step 4: Attempt connection with retries
        console.log('Step 4: Attempting to connect...');
        const connected = await connectToWifi(wifiName, wifiPassword);

        if (!connected) {
            console.error('Failed to connect to Wi-Fi after all retry attempts');
            printLCD('connection failed', 'check credentials');
            throw new Error('Unable to connect to Wi-Fi');
        }

        console.log('Successfully connected to Wi-Fi');
        printLCD('wifi connected', wifiName.substring(0, 16));

    } catch (error) {
        console.error(`Wi-Fi connection error: ${error.message}`);
        printLCD('wifi error', 'check config');
        throw error;
    }
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
    checkWifiConnection,
    getMyIP,
    resetWifiInterface,
    cleanupWifiConnections,
    verifyWifiConnection
};
