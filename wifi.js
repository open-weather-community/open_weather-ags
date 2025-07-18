// wifi.js

const { exec } = require('child_process');
const { promisify } = require('util');
const { printLCD } = require('./lcd'); // Assuming you have an lcd module

const execAsync = promisify(exec);

// Function to reset wifi interface and clean up connections
async function resetWifiInterface() {
    try {
        console.log('Resetting wifi interface...');

        // Simple approach - just disconnect cleanly
        await execAsync('/usr/bin/nmcli device disconnect wlan0');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

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
    console.log(`=== Network Scan Started for "${targetSSID}" ===`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Scanning for network "${targetSSID}" (attempt ${attempt}/${maxRetries})...`);

            // First, check if WiFi interface is up and ready
            try {
                const { stdout: interfaceStatus } = await execAsync('/usr/bin/nmcli device status');
                console.log('WiFi interface status:');
                console.log(interfaceStatus);
            } catch (error) {
                console.log('Could not get interface status');
            }

            // Trigger a fresh scan with more aggressive approach
            console.log('Triggering WiFi scan...');
            await execAsync('/usr/bin/nmcli device wifi rescan');
            await new Promise(resolve => setTimeout(resolve, 8000)); // Wait longer for scan to complete

            // Get detailed scan results with signal strength and security
            console.log('Retrieving scan results...');
            const { stdout: detailedScan } = await execAsync('/usr/bin/nmcli -f ssid,signal,security device wifi list');
            console.log('=== Detailed WiFi Scan Results ===');
            console.log(detailedScan);
            console.log('=== End Scan Results ===');

            // Get simple SSID list for easier parsing
            const { stdout } = await execAsync('/usr/bin/nmcli -t -f ssid device wifi list');
            const networks = stdout.split('\n').filter(line => line.trim() && line !== '--');

            // Log scan statistics
            console.log(`Total networks found: ${networks.length}`);
            console.log(`Unique networks: ${[...new Set(networks)].length}`);

            // Show first 15 networks for debugging (avoid log spam but show more than before)
            if (networks.length > 0) {
                const uniqueNetworks = [...new Set(networks)].slice(0, 15);
                console.log(`Available networks (first 15): ${uniqueNetworks.map(n => `"${n}"`).join(', ')}`);
            } else {
                console.log('WARNING: No networks found in scan results');
            }

            // Check for exact match first
            const exactMatch = networks.find(network => network === targetSSID);
            if (exactMatch) {
                console.log(`SUCCESS: Network "${targetSSID}" found in scan (exact match)`);
                return true;
            }

            // Check for case-insensitive match
            const caseInsensitiveMatch = networks.find(network =>
                network.toLowerCase() === targetSSID.toLowerCase()
            );
            if (caseInsensitiveMatch) {
                console.log(`SUCCESS: Network found with different case: "${caseInsensitiveMatch}" matches target "${targetSSID}"`);
                return true;
            }

            // Look for partial matches (helpful for debugging)
            const partialMatches = networks.filter(network =>
                network.includes(targetSSID) ||
                targetSSID.includes(network) ||
                network.toLowerCase().includes(targetSSID.toLowerCase().substring(0, Math.min(8, targetSSID.length)))
            );

            if (partialMatches.length > 0) {
                console.log(`Partial matches found: ${partialMatches.map(n => `"${n}"`).join(', ')}`);
                console.log(`Target network "${targetSSID}" not found exactly, but similar networks exist`);
            } else {
                console.log(`No partial matches found for "${targetSSID}"`);
            }

            // Check if scan returned any results at all
            if (networks.length === 0) {
                console.log('WARNING: WiFi scan returned no results - this may indicate hardware or driver issues');

                // Additional debugging for hardware issues
                try {
                    const { stdout: rfkillStatus } = await execAsync('rfkill list wifi');
                    console.log('WiFi hardware status (rfkill):');
                    console.log(rfkillStatus);
                } catch (error) {
                    console.log('Could not check rfkill status');
                }
            }

            console.log(`Network "${targetSSID}" not found, waiting before retry...`);
            if (attempt < maxRetries) {
                console.log(`Waiting 8 seconds before retry attempt ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 8000));
            }
        } catch (error) {
            console.error(`Scan attempt ${attempt} failed: ${error.message}`);

            // Log additional debugging info on scan failures
            if (error.message.includes('No such device')) {
                console.log('ERROR: WiFi device not found - this suggests hardware/driver issues');
            } else if (error.message.includes('Operation not permitted')) {
                console.log('ERROR: Permission denied - check user permissions for nmcli');
            } else if (error.message.includes('timeout')) {
                console.log('ERROR: Scan timeout - network hardware may be unresponsive');
            }

            if (attempt < maxRetries) {
                console.log(`Waiting 5 seconds before scan retry ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }

    console.log(`FAILURE: Network "${targetSSID}" not found after ${maxRetries} scan attempts`);
    console.log('This could indicate:');
    console.log('1. Network name is incorrect in configuration');
    console.log('2. Network is out of range');
    console.log('3. Network is hidden (not broadcasting SSID)');
    console.log('4. WiFi hardware/driver issues');
    console.log('5. USB device interference with WiFi');
    return false;
}

// Function to verify wifi connection is working
async function verifyWifiConnection() {
    try {
        console.log('Verifying WiFi connection...');

        // Check if we're connected to any wifi network
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));

        if (!activeConnections.length) {
            console.log('No active WiFi connections found');
            return false;
        }

        const connectedSSID = activeConnections[0].split(':')[1];
        console.log(`Currently connected to WiFi network: "${connectedSSID}"`);

        // Check if we have an IP address
        try {
            const { stdout: ipInfo } = await execAsync('/usr/bin/nmcli -t -f IP4.ADDRESS dev show wlan0');
            if (ipInfo.trim()) {
                const ipAddress = ipInfo.split('/')[0].replace('IP4.ADDRESS[1]:', '');
                console.log(`WiFi IP address: ${ipAddress}`);
            } else {
                console.log('WARNING: Connected to WiFi but no IP address assigned');
            }
        } catch (error) {
            console.log('Could not retrieve WiFi IP address information');
        }

        // Try to ping a reliable server to verify internet connectivity
        try {
            console.log('Testing internet connectivity...');
            await execAsync('ping -c 1 -W 5 8.8.8.8');
            console.log('Internet connectivity verified via ping');
            return true;
        } catch (pingError) {
            console.log('Connected to WiFi but ping test failed (no internet access)');
            console.log('This may indicate network issues, captive portal, or DNS problems');
            return true; // Still consider this a successful wifi connection
        }

    } catch (error) {
        console.error(`Error verifying WiFi connection: ${error.message}`);
        return false;
    }
}

// Function to attempt wifi connection with retries
async function connectToWifi(wifiName, wifiPassword, maxRetries = 3) {
    console.log(`=== Connection Attempts Starting for "${wifiName}" ===`);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Connection attempt ${attempt}/${maxRetries} to "${wifiName}"...`);

            // Log the exact command that will be used (without password)
            if (wifiPassword) {
                console.log(`Using command: nmcli device wifi connect "${wifiName}" password "***"`);
            } else {
                console.log(`Using command: nmcli device wifi connect "${wifiName}" (no password)`);
            }

            let command;
            if (wifiPassword) {
                command = `/usr/bin/nmcli device wifi connect "${wifiName}" password "${wifiPassword}"`;
            } else {
                command = `/usr/bin/nmcli device wifi connect "${wifiName}"`;
            }

            const { stdout, stderr } = await execAsync(command);
            console.log(`nmcli connection output: ${stdout}`);
            if (stderr) {
                console.log(`nmcli connection stderr: ${stderr}`);
            }

            // Give more time for connection to stabilize before verification
            console.log('Waiting 8 seconds for connection to stabilize...');
            await new Promise(resolve => setTimeout(resolve, 8000));

            const isConnected = await verifyWifiConnection();

            if (isConnected) {
                console.log(`SUCCESS: WiFi connection to "${wifiName}" verified successfully`);
                return true;
            } else {
                console.log(`Connection to "${wifiName}" appeared successful but verification failed`);
                console.log('This could indicate:');
                console.log('1. Authentication succeeded but no internet access');
                console.log('2. Network configuration issues (DHCP, DNS)');
                console.log('3. Captive portal or additional authentication required');

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

            console.error(`Connection attempt ${attempt} to "${wifiName}" failed: ${message}`);

            // Provide specific debugging based on error type
            if (message.includes('Secrets were required, but not provided')) {
                console.log('ERROR: Network requires password but none provided or password incorrect');
            } else if (message.includes('No network with SSID')) {
                console.log('ERROR: Network not found during connection attempt (may have disappeared)');
            } else if (message.includes('Connection activation failed')) {
                console.log('ERROR: Connection failed - could be wrong password, network issues, or interference');
            } else if (message.includes('Device or resource busy')) {
                console.log('ERROR: WiFi device busy - may need interface reset');
            } else if (message.includes('timeout')) {
                console.log('ERROR: Connection timeout - network may be overloaded or have poor signal');
            }

            if (attempt < maxRetries) {
                console.log(`Waiting 10 seconds before connection retry ${attempt + 1}...`);
                await new Promise(resolve => setTimeout(resolve, 10000)); // Longer wait between retries
            }
        }
    }

    console.log(`FAILURE: Could not connect to "${wifiName}" after ${maxRetries} attempts`);
    return false;
}

async function checkWifiConnection(config) {
    try {
        console.log(`=== WiFi Connection Attempt Started ===`);
        console.log(`Target network: "${config.wifiName}"`);
        console.log(`WiFi password provided: ${config.wifiPassword ? 'Yes' : 'No'}`);

        printLCD('checking wifi', 'connection...');

        // Log USB device information for debugging USB/WiFi interaction
        try {
            const { stdout: usbInfo } = await execAsync('lsusb | grep -E "(Storage|Mass|USB)"');
            console.log(`USB devices detected: ${usbInfo.trim() || 'None found'}`);
        } catch (error) {
            console.log('Could not enumerate USB devices');
        }

        // First, check if we're already connected to the target network
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));

        if (activeConnections.length > 0) {
            const currentSSID = activeConnections[0].split(':')[1];
            console.log(`Currently connected to: "${currentSSID}"`);
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
                console.log(`Connected to different network: "${currentSSID}", need to switch to: "${config.wifiName}"`);
            }
        } else {
            console.log('No active wifi connection detected');
        }

        // If we reach here, we need to connect/reconnect
        const wifiName = config.wifiName;
        const wifiPassword = config.wifiPassword;

        if (!wifiName) {
            console.error('ERROR: Wi-Fi name not found in config');
            console.log(`Config wifiName value: "${config.wifiName}" (type: ${typeof config.wifiName})`);
            printLCD('config error', 'no wifi name');
            throw new Error('Wi-Fi name not found in config');
        }

        console.log(`Proceeding with WiFi connection to: "${wifiName}"`);
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
        console.log(`Step 3: Scanning for target network "${wifiName}"...`);
        const networkFound = await scanForNetwork(wifiName);
        if (!networkFound) {
            console.error(`CRITICAL: Target network "${wifiName}" not found in scans`);
            console.log('Troubleshooting suggestions:');
            console.log('1. Verify the network name is correct in your configuration');
            console.log('2. Check if the network is broadcasting (not hidden)');
            console.log('3. Ensure you are within range of the WiFi network');
            console.log('4. Try disconnecting USB devices and retest WiFi');
            console.log('5. Check if network name has special characters or spaces');
            printLCD('network not found', wifiName.substring(0, 16));
            throw new Error(`Wi-Fi network "${wifiName}" not found after scanning`);
        }

        console.log(`SUCCESS: Network "${wifiName}" found, proceeding with connection...`);

        // Step 4: Attempt connection with retries
        console.log(`Step 4: Attempting to connect to "${wifiName}"...`);
        const connected = await connectToWifi(wifiName, wifiPassword);

        if (!connected) {
            console.error(`CRITICAL: Failed to connect to "${wifiName}" after all retry attempts`);
            console.log('Final troubleshooting suggestions:');
            console.log('1. Verify WiFi password is correct');
            console.log('2. Check network security settings (WPA2, WPA3, etc.)');
            console.log('3. Try connecting without USB devices plugged in');
            console.log('4. Check for network access restrictions (MAC filtering)');
            console.log('5. Verify network supports the number of connected devices');
            printLCD('connection failed', 'check credentials');
            throw new Error(`Unable to connect to Wi-Fi network "${wifiName}"`);
        }

        console.log(`SUCCESS: Successfully connected to WiFi network "${wifiName}"`);
        printLCD('wifi connected', wifiName.substring(0, 16));

        console.log(`=== WiFi Connection Completed Successfully ===`);

    } catch (error) {
        console.error(`Wi-Fi connection error for network "${config.wifiName || 'unknown'}": ${error.message}`);
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
