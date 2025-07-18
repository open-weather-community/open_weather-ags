#!/usr/bin/env node

// test-usb-wifi.js - Script to test USB/WiFi interaction issues
// This script helps diagnose the specific issue where WiFi works without USB but fails with USB connected

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

async function testUSBWiFiInteraction() {
    console.log('=== USB/WiFi Interaction Test ===');
    console.log('This script tests for interference between USB storage and WiFi');
    console.log('');

    try {
        // 1. Check current USB devices
        console.log('1. Checking USB devices...');
        try {
            const { stdout: usbList } = await execAsync('lsusb');
            const usbDevices = usbList.split('\n').filter(line => line.trim());
            console.log(`   Total USB devices: ${usbDevices.length}`);

            const storageDevices = usbDevices.filter(line =>
                line.includes('Storage') ||
                line.includes('Mass') ||
                line.includes('Flash') ||
                line.includes('Disk')
            );

            if (storageDevices.length > 0) {
                console.log(`   USB storage devices found: ${storageDevices.length}`);
                storageDevices.forEach(device => {
                    console.log(`   - ${device}`);
                });
            } else {
                console.log('   No USB storage devices detected');
            }
        } catch (error) {
            console.log(`   Error checking USB devices: ${error.message}`);
        }

        // 2. Check USB device power consumption
        console.log('\n2. Checking USB power status...');
        try {
            const { stdout: powerInfo } = await execAsync('cat /sys/kernel/debug/usb/devices 2>/dev/null || echo "USB debug info not available"');
            if (powerInfo.includes('not available')) {
                console.log('   USB debug information not available (requires root)');
            } else {
                const powerLines = powerInfo.split('\n').filter(line => line.includes('MaxPower'));
                if (powerLines.length > 0) {
                    console.log('   USB device power consumption:');
                    powerLines.forEach(line => {
                        console.log(`   - ${line.trim()}`);
                    });
                }
            }
        } catch (error) {
            console.log(`   Could not read USB power information: ${error.message}`);
        }

        // 3. Check mounted USB drives
        console.log('\n3. Checking mounted USB drives...');
        try {
            const { stdout: mountInfo } = await execAsync('mount | grep -E "(usb|sda|sdb|sdc)"');
            if (mountInfo.trim()) {
                console.log('   Mounted USB drives:');
                mountInfo.split('\n').forEach(line => {
                    if (line.trim()) {
                        console.log(`   - ${line}`);
                    }
                });
            } else {
                console.log('   No USB drives currently mounted');
            }
        } catch (error) {
            console.log('   No USB drives mounted or error checking mounts');
        }

        // 4. Check WiFi interface status
        console.log('\n4. Checking WiFi interface status...');
        try {
            const { stdout: wifiStatus } = await execAsync('nmcli device status | grep wifi');
            if (wifiStatus.trim()) {
                console.log('   WiFi interface status:');
                console.log(`   ${wifiStatus.trim()}`);
            } else {
                console.log('   No WiFi interfaces found');
            }
        } catch (error) {
            console.log(`   Error checking WiFi status: ${error.message}`);
        }

        // 5. Check for USB/WiFi on same bus
        console.log('\n5. Checking USB/WiFi bus conflicts...');
        try {
            const { stdout: lsusbVerbose } = await execAsync('lsusb -t');
            console.log('   USB device tree:');
            console.log(lsusbVerbose);

            // Look for wireless devices
            const { stdout: wifiDevices } = await execAsync('lsusb | grep -i "wireless\\|wifi\\|802.11" || echo "No USB WiFi devices"');
            console.log('   USB WiFi devices:');
            console.log(`   ${wifiDevices}`);

        } catch (error) {
            console.log(`   Could not check USB bus information: ${error.message}`);
        }

        // 6. Check kernel messages for USB/WiFi issues
        console.log('\n6. Checking recent kernel messages for USB/WiFi issues...');
        try {
            const { stdout: dmesgOutput } = await execAsync('dmesg | grep -i -E "(usb|wifi|wlan)" | tail -10');
            if (dmesgOutput.trim()) {
                console.log('   Recent USB/WiFi kernel messages:');
                dmesgOutput.split('\n').forEach(line => {
                    if (line.trim()) {
                        console.log(`   ${line}`);
                    }
                });
            } else {
                console.log('   No recent USB/WiFi kernel messages');
            }
        } catch (error) {
            console.log(`   Could not check kernel messages: ${error.message}`);
        }

        // 7. Test WiFi scan capability
        console.log('\n7. Testing WiFi scan capability...');
        try {
            console.log('   Triggering WiFi scan...');
            await execAsync('nmcli device wifi rescan');
            await new Promise(resolve => setTimeout(resolve, 5000));

            const { stdout: scanResults } = await execAsync('nmcli -t -f ssid device wifi list');
            const networks = scanResults.split('\n').filter(line => line.trim() && line !== '--');

            console.log(`   WiFi scan results: ${networks.length} networks found`);
            if (networks.length > 0) {
                console.log('   ✓ WiFi scanning is working');
                console.log(`   Sample networks: ${networks.slice(0, 3).join(', ')}${networks.length > 3 ? '...' : ''}`);
            } else {
                console.log('   ⚠ WiFi scan returned no results - possible interference or hardware issue');
            }
        } catch (error) {
            console.log(`   ⚠ WiFi scan failed: ${error.message}`);
        }

        // 8. Test USB I/O while WiFi scanning
        console.log('\n8. Testing USB I/O during WiFi operations...');
        try {
            // Look for a mounted USB device to test
            const { stdout: mountedUSB } = await execAsync('mount | grep -E "(usb|sda|sdb)" | head -1');
            if (mountedUSB.trim()) {
                const mountPoint = mountedUSB.split(' ')[2];
                console.log(`   Testing USB I/O on ${mountPoint}...`);

                // Start WiFi scan in background
                const wifiScanPromise = execAsync('nmcli device wifi rescan');

                // Test USB read/write
                const usbTestPromise = execAsync(`ls -la ${mountPoint} > /dev/null 2>&1`);

                try {
                    await Promise.all([wifiScanPromise, usbTestPromise]);
                    console.log('   ✓ USB I/O and WiFi scan can run simultaneously');
                } catch (error) {
                    console.log(`   ⚠ Concurrent USB/WiFi operations failed: ${error.message}`);
                }
            } else {
                console.log('   No mounted USB devices to test I/O');
            }
        } catch (error) {
            console.log(`   Could not test USB I/O: ${error.message}`);
        }

        console.log('\n=== Test Summary ===');
        console.log('If WiFi works without USB but fails with USB connected, possible causes:');
        console.log('1. Power supply insufficient for USB + WiFi');
        console.log('2. USB 2.4GHz interference with WiFi frequencies');
        console.log('3. USB controller sharing bandwidth with WiFi');
        console.log('4. Driver conflicts or kernel resource competition');
        console.log('5. EMI (electromagnetic interference) from USB cables/devices');
        console.log('');
        console.log('Suggested solutions:');
        console.log('1. Use a powered USB hub to reduce Pi power load');
        console.log('2. Use USB 3.0 devices instead of USB 2.0 (different frequency)');
        console.log('3. Physically separate USB devices from WiFi antenna');
        console.log('4. Use shielded USB cables');
        console.log('5. Try different USB ports');

    } catch (error) {
        console.error(`Test failed: ${error.message}`);
    }
}

// Run the test
if (require.main === module) {
    testUSBWiFiInteraction().catch(console.error);
}

module.exports = { testUSBWiFiInteraction };
