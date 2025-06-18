# TODO: Fix WiFi Connection Issues

## Problem Statement
The system currently requires multiple reboots (2-5 restarts) when users change WiFi network credentials in their configuration. This creates a poor user experience and makes network changes unreliable.

## Root Causes Identified
1. **No NetworkManager Profile Cleanup**: Old WiFi connection profiles remain active, causing conflicts
2. **Insufficient Connection Verification**: System reports success even when connection is unstable
3. **No Interface Reset**: WiFi interface isn't properly reset between attempts
4. **Single-Attempt Logic**: No retry mechanisms for transient failures
5. **Race Conditions**: Connection attempts happen too quickly after boot
6. **Poor Error Recovery**: System exits on first failure instead of attempting recovery

## Implementation Plan

### Step 1: Enhance wifi.js - Add Utility Functions

Add these utility functions to `wifi.js`:

```javascript
const { promisify } = require('util');
const execAsync = promisify(exec);

// Function to reset wifi interface and clean up connections
async function resetWifiInterface() {
    try {
        console.log('Resetting wifi interface...');
        
        // Turn wifi off and back on to ensure clean state
        await execAsync('/usr/bin/nmcli radio wifi off');
        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds
        await execAsync('/usr/bin/nmcli radio wifi on');
        await new Promise(resolve => setTimeout(resolve, 3000)); // Wait 3 seconds for interface to come up
        
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
```

### Step 2: Add Network Scanning Function

```javascript
// Function to scan for available networks
async function scanForNetwork(targetSSID, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Scanning for network "${targetSSID}" (attempt ${attempt}/${maxRetries})...`);
            
            // Trigger a fresh scan
            await execAsync('/usr/bin/nmcli device wifi rescan');
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait for scan to complete
            
            // Check if target network is visible
            const { stdout } = await execAsync('/usr/bin/nmcli -t -f ssid device wifi list');
            const networks = stdout.split('\n').filter(line => line.trim());
            
            if (networks.includes(targetSSID)) {
                console.log(`Network "${targetSSID}" found in scan`);
                return true;
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
```

### Step 3: Add Robust Connection Function

```javascript
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
            
            // Verify connection is actually working
            await new Promise(resolve => setTimeout(resolve, 3000));
            const isConnected = await verifyWifiConnection();
            
            if (isConnected) {
                console.log('Wifi connection verified successfully');
                return true;
            } else {
                console.log('Connection appeared successful but verification failed');
                if (attempt < maxRetries) {
                    await cleanupWifiConnections(wifiName);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
            
        } catch (error) {
            let message = error.message || error.stderr || 'Unknown error';
            
            // Sanitize message: Remove password from nmcli command output
            message = message.replace(/password\s+"[^"]+"/, 'password "***"');
            
            console.error(`Connection attempt ${attempt} failed: ${message}`);
            
            if (attempt < maxRetries) {
                console.log('Waiting before retry...');
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
    
    return false;
}
```

### Step 4: Add Connection Verification Function

```javascript
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
```

### Step 5: Rewrite Main checkWifiConnection Function

Replace the existing `checkWifiConnection` function with:

```javascript
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
        
        // Step 1: Reset wifi interface for clean state
        console.log('Step 1: Resetting wifi interface...');
        await resetWifiInterface();
        
        // Step 2: Clean up existing connections
        console.log('Step 2: Cleaning up existing connections...');
        await cleanupWifiConnections(wifiName);
        
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
```

### Step 6: Update Module Exports

Update the module.exports at the end of `wifi.js`:

```javascript
module.exports = {
    checkWifiConnection,
    getMyIP,
    resetWifiInterface,
    cleanupWifiConnections,
    verifyWifiConnection
};
```

### Step 7: Improve Scheduler WiFi Handling

In `scheduler.js`, replace the existing WiFi connection code with:

```javascript
// Allow system to settle after config load
await new Promise(resolve => setTimeout(resolve, 5000));

// check Wi-Fi connection with retry logic
printLCD('checking', 'Wi-Fi...');
let wifiConnected = false;
let wifiRetryCount = 0;
const maxWifiRetries = 3;

while (!wifiConnected && wifiRetryCount < maxWifiRetries) {
    try {
        wifiRetryCount++;
        console.log(`Wi-Fi connection attempt ${wifiRetryCount}/${maxWifiRetries}`);
        await checkWifiConnection(config);
        wifiConnected = true;
        printLCD('Wi-Fi', 'connected');
        console.log('Wi-Fi connection successful');
    } catch (error) {
        console.error(`Wi-Fi connection attempt ${wifiRetryCount} failed: ${error.message}`);
        if (logger) logger.error(`Wi-Fi connection attempt ${wifiRetryCount} failed: ${error.message}`);
        
        if (wifiRetryCount < maxWifiRetries) {
            console.log(`Retrying Wi-Fi connection in 10 seconds...`);
            printLCD('Wi-Fi retry', `attempt ${wifiRetryCount + 1}/${maxWifiRetries}`);
            await new Promise(resolve => setTimeout(resolve, 10000));
        } else {
            console.error('All Wi-Fi connection attempts failed');
            printLCD('Wi-Fi failed', 'check config');
            // Don't exit immediately, log the error and continue
            if (logger) logger.error('All Wi-Fi connection attempts failed - system will continue without network');
            
            // Wait a bit more and try one last time
            console.log('Final Wi-Fi attempt in 15 seconds...');
            printLCD('Final Wi-Fi', 'attempt...');
            await new Promise(resolve => setTimeout(resolve, 15000));
            
            try {
                await checkWifiConnection(config);
                wifiConnected = true;
                printLCD('Wi-Fi', 'connected');
                console.log('Final Wi-Fi attempt successful');
            } catch (finalError) {
                console.error(`Final Wi-Fi attempt failed: ${finalError.message}`);
                printLCD('Wi-Fi failed', 'continuing...');
                // Continue without network - system may recover later
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }
    }
}
```

## Expected Results

After implementing these changes:
- ✅ Network changes should work on first reboot (>95% success rate)
- ✅ Better handling of edge cases (weak signal, slow routers, interference)
- ✅ Clear user feedback via LCD during connection process
- ✅ Extensive logging for troubleshooting
- ✅ System resilience - doesn't crash on WiFi failures

## Testing Steps

1. **Change WiFi credentials** in config file
2. **Reboot system** once
3. **Verify connection** works immediately
4. **Test edge cases**: weak signal, wrong password, network not found
5. **Check logs** for detailed connection process information

## Priority: HIGH
This issue significantly impacts user experience and system reliability. Users currently need to reboot multiple times when changing networks, which is frustrating and makes the system appear unreliable.
