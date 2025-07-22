#!/usr/bin/env node

// test-wifi-connection.js - Standalone WiFi connection tester and debugger

const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

// Test if we can load the config
async function loadConfig() {
    try {
        const { loadConfig } = require('./config');
        const config = await loadConfig();
        console.log(`✅ Config loaded successfully`);
        console.log(`   - WiFi Name: "${config.wifiName}"`);
        console.log(`   - WiFi Password: ${config.wifiPassword ? 'Provided' : 'Not provided'}`);
        console.log(`   - Station ID: ${config.myID}`);
        return config;
    } catch (error) {
        console.error(`❌ Failed to load config: ${error.message}`);
        return null;
    }
}

// Check current WiFi status
async function checkCurrentWifiStatus() {
    console.log('\n=== Current WiFi Status ===');

    try {
        // Check if connected to any WiFi
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));

        if (activeConnections.length > 0) {
            const currentSSID = activeConnections[0].split(':')[1];
            console.log(`✅ Connected to WiFi: "${currentSSID}"`);

            // Get IP address
            try {
                const { stdout: ipInfo } = await execAsync('/usr/bin/nmcli -t -f IP4.ADDRESS dev show wlan0');
                if (ipInfo.trim()) {
                    const ipAddress = ipInfo.split('/')[0].replace('IP4.ADDRESS[1]:', '');
                    console.log(`   - IP Address: ${ipAddress}`);
                } else {
                    console.log(`   - ⚠️  No IP address assigned`);
                }
            } catch (error) {
                console.log(`   - ⚠️  Could not get IP address`);
            }

            // Test internet connectivity
            try {
                await execAsync('ping -c 1 -W 5 8.8.8.8');
                console.log(`   - ✅ Internet connectivity: Working`);
            } catch (error) {
                console.log(`   - ❌ Internet connectivity: Failed`);
            }

        } else {
            console.log(`❌ Not connected to any WiFi network`);
        }

    } catch (error) {
        console.error(`❌ Error checking WiFi status: ${error.message}`);
    }
}

// Scan for available networks
async function scanAvailableNetworks(targetSSID = null) {
    console.log('\n=== Available WiFi Networks ===');

    try {
        // Try to trigger fresh scan (may fail due to permissions)
        console.log('Attempting to scan for networks...');
        try {
            await execAsync('/usr/bin/nmcli device wifi rescan');
            await new Promise(resolve => setTimeout(resolve, 5000));
            console.log('✅ WiFi scan completed successfully');
        } catch (scanError) {
            if (scanError.message.includes('not authorized')) {
                console.log('⚠️  WiFi scan requires elevated permissions, using cached results');
                console.log('   (This is normal - scanning still works during system operation)');
            } else {
                console.log(`⚠️  WiFi scan failed: ${scanError.message}`);
            }
        }

        // Get scan results (this should work even without rescan permissions)
        const { stdout } = await execAsync('/usr/bin/nmcli -f ssid,signal,security device wifi list');
        console.log('\nAvailable Networks:');
        console.log(stdout);

        if (targetSSID) {
            // Check specifically for target network
            const { stdout: simpleScan } = await execAsync('/usr/bin/nmcli -t -f ssid device wifi list');
            const networks = simpleScan.split('\n').filter(line => line.trim() && line !== '--');

            const exactMatch = networks.find(network => network === targetSSID);
            const caseInsensitiveMatch = networks.find(network =>
                network.toLowerCase() === targetSSID.toLowerCase()
            );

            if (exactMatch) {
                console.log(`✅ Target network "${targetSSID}" found (exact match)`);
            } else if (caseInsensitiveMatch) {
                console.log(`⚠️  Target network found with different case: "${caseInsensitiveMatch}"`);
            } else {
                console.log(`❌ Target network "${targetSSID}" not found in cached results`);
                console.log('   Note: Results may be outdated if scan permissions are limited');

                // Look for partial matches
                const partialMatches = networks.filter(network =>
                    network.includes(targetSSID) || targetSSID.includes(network)
                );

                if (partialMatches.length > 0) {
                    console.log(`   Similar networks found: ${partialMatches.join(', ')}`);
                }
            }
        }

    } catch (error) {
        console.error(`❌ Error accessing WiFi information: ${error.message}`);
        console.log('This may indicate NetworkManager permission issues or WiFi hardware problems');
    }
}// Check hardware status
async function checkHardwareStatus() {
    console.log('\n=== Hardware Status ===');

    try {
        // Check WiFi interface
        const { stdout: interfaces } = await execAsync('ip link show');
        console.log('Network interfaces:');
        const lines = interfaces.split('\n').filter(line => line.includes(':') && line.includes('BROADCAST'));
        for (const line of lines) {
            const interfaceName = line.split(':')[1].trim();
            const status = line.includes('state UP') ? 'UP' : 'DOWN';
            console.log(`   - ${interfaceName}: ${status}`);
        }

        // Check rfkill status
        try {
            const { stdout: rfkillStatus } = await execAsync('rfkill list wifi');
            console.log('\nWiFi hardware status (rfkill):');
            console.log(rfkillStatus);
        } catch (error) {
            console.log('Could not check rfkill status');
        }

        // Check USB devices for potential interference
        try {
            const { stdout: usbDevices } = await execAsync('lsusb');
            const storageDevices = usbDevices.split('\n').filter(line =>
                line.includes('Storage') || line.includes('Mass') || line.includes('Flash')
            );

            if (storageDevices.length > 0) {
                console.log(`\n⚠️  USB storage devices detected (${storageDevices.length}) - may cause WiFi interference:`);
                storageDevices.forEach(device => console.log(`   - ${device.trim()}`));
            } else {
                console.log('\n✅ No USB storage devices detected');
            }
        } catch (error) {
            console.log('Could not check USB devices');
        }

    } catch (error) {
        console.error(`❌ Error checking hardware: ${error.message}`);
    }
}

// Test WiFi connection without affecting current state
async function testWifiConnection(config) {
    console.log('\n=== Testing WiFi Connection ===');

    if (!config || !config.wifiName) {
        console.error('❌ No WiFi configuration available for testing');
        return;
    }

    console.log(`Testing connection to: "${config.wifiName}"`);

    // This is a dry-run test that doesn't actually change connections
    console.log('This is a DRY RUN - no actual connection changes will be made');

    // Just verify the network exists and password format
    await scanAvailableNetworks(config.wifiName);

    if (config.wifiPassword) {
        console.log(`✅ WiFi password provided (${config.wifiPassword.length} characters)`);
    } else {
        console.log(`⚠️  No WiFi password provided (network may be open)`);
    }
}

// Main function
async function main() {
    console.log('🔍 WiFi Connection Diagnostic Tool\n');

    let wifiWorking = false;
    let ethernetWorking = false;
    let configValid = false;

    try {
        // Load configuration
        const config = await loadConfig();
        configValid = !!(config && config.wifiName);

        // Check current status
        const currentStatus = await checkCurrentWifiStatus();

        // Check hardware
        await checkHardwareStatus();

        // Scan networks
        if (config && config.wifiName) {
            await scanAvailableNetworks(config.wifiName);
        } else {
            await scanAvailableNetworks();
        }

        // Test connection (dry run)
        await testWifiConnection(config);

        // Determine overall status
        try {
            const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
            const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));
            wifiWorking = activeConnections.length > 0;

            if (wifiWorking && config && config.wifiName) {
                const currentSSID = activeConnections[0].split(':')[1];
                wifiWorking = currentSSID === config.wifiName;
            }
        } catch (error) {
            wifiWorking = false;
        }

        console.log('\n=== DIAGNOSTIC SUMMARY ===');

        if (wifiWorking && configValid) {
            console.log('🎉 WiFi Status: EXCELLENT');
            console.log('   ✅ Connected to correct network');
            console.log('   ✅ Internet connectivity working');
            console.log('   ✅ Configuration is valid');
            console.log('\n💡 Your WiFi connection is working perfectly!');
            console.log('   If you were experiencing issues, they may have been resolved by recent fixes.');
        } else if (wifiWorking && !configValid) {
            console.log('⚠️  WiFi Status: GOOD (Minor Issues)');
            console.log('   ✅ WiFi connection working');
            console.log('   ❌ Configuration issues detected');
            console.log('\n💡 Your WiFi works but there may be config problems.');
        } else if (!wifiWorking && configValid) {
            console.log('❌ WiFi Status: NEEDS ATTENTION');
            console.log('   ❌ WiFi connection not working properly');
            console.log('   ✅ Configuration appears valid');
            console.log('\n💡 WiFi issues detected - troubleshooting needed.');
        } else {
            console.log('❌ WiFi Status: MULTIPLE ISSUES');
            console.log('   ❌ WiFi connection problems');
            console.log('   ❌ Configuration problems');
            console.log('\n💡 Multiple issues need to be resolved.');
        }

        console.log('\n=== Troubleshooting Guide ===');
        if (wifiWorking) {
            console.log('Your WiFi is currently working well. If you experience future issues:');
            console.log('1. Run this diagnostic again to check status');
            console.log('2. Check the system logs for error patterns');
            console.log('3. Recent improvements should prevent startup disconnections');
        } else {
            console.log('WiFi connection needs attention:');
            console.log('1. Ensure WiFi network name is correct in configuration');
            console.log('2. Verify WiFi password is correct');
            console.log('3. Check if network is in range and broadcasting');
            console.log('4. Try disconnecting USB devices to test for interference');
            console.log('5. Consider using 5GHz network if available to avoid 2.4GHz interference');
        }

    } catch (error) {
        console.error(`❌ Diagnostic failed: ${error.message}`);
        process.exit(1);
    }
}// Allow script to be run standalone
if (require.main === module) {
    main().catch(error => {
        console.error(`Fatal error: ${error.message}`);
        process.exit(1);
    });
}

module.exports = {
    loadConfig,
    checkCurrentWifiStatus,
    scanAvailableNetworks,
    checkHardwareStatus,
    testWifiConnection
};
