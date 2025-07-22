#!/usr/bin/env node

/**
 * Quick USB-WiFi Interference Diagnostic
 * Run this script to identify if USB is causing WiFi issues
 */

const { execSync } = require('child_process');
const fs = require('fs');

console.log('=== USB-WiFi Interference Diagnostic ===\n');

function runCommand(cmd, description) {
    console.log(`${description}:`);
    try {
        const output = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
        console.log(output.trim() || 'No output');
    } catch (err) {
        console.log(`Error: ${err.message}`);
    }
    console.log('');
}

// 1. Check current WiFi status
runCommand('iwconfig 2>/dev/null | grep -A 5 -B 5 IEEE', 'WiFi Interface Status');

// 2. Check network connectivity
runCommand('ping -c 3 8.8.8.8', 'Network Connectivity Test');

// 3. Check USB devices
runCommand('lsusb', 'Connected USB Devices');

// 4. Check for USB errors
runCommand('dmesg | grep -i usb | tail -10', 'Recent USB Kernel Messages');

// 5. Check WiFi signal strength and noise
runCommand('iwlist scan 2>/dev/null | grep -E "(ESSID|Quality|Signal)" | head -10', 'WiFi Scan Results');

// 6. Check USB power consumption
runCommand('lsusb -v 2>/dev/null | grep -A 2 -B 2 MaxPower', 'USB Power Consumption');

// 7. Check network manager status
runCommand('nmcli dev status', 'NetworkManager Device Status');

// 8. Check for interference frequencies
runCommand('iwlist freq 2>/dev/null | grep -E "(Channel|Frequency)" | head -5', 'Available WiFi Frequencies');

// 9. Check system load
runCommand('uptime', 'System Load');

// 10. Check for config file corruption
console.log('Config File Status:');
const configPaths = [
    '/media/openweather/O-W/ow-config.json',
    '/media/openweather/ow-config.json'
];

for (const configPath of configPaths) {
    try {
        if (fs.existsSync(configPath)) {
            const content = fs.readFileSync(configPath, 'utf8');

            if (content.includes('\0')) {
                console.log(`❌ CORRUPTED (null bytes): ${configPath}`);
            } else {
                try {
                    JSON.parse(content);
                    console.log(`✅ VALID: ${configPath}`);
                } catch (err) {
                    console.log(`❌ CORRUPTED (invalid JSON): ${configPath}`);
                }
            }
        } else {
            console.log(`❌ NOT FOUND: ${configPath}`);
        }
    } catch (err) {
        console.log(`❌ ERROR checking ${configPath}: ${err.message}`);
    }
}

console.log('\n=== Recommendations ===');
console.log('If you see frequent USB disconnects or WiFi drops when USB is connected:');
console.log('1. Try a powered USB hub');
console.log('2. Use a different USB port (preferably USB 3.0)');
console.log('3. Try a shorter, higher quality USB cable');
console.log('4. Consider using 5GHz WiFi instead of 2.4GHz to avoid interference');
console.log('5. Check if the USB device draws too much power (>500mA is problematic)');
console.log('\nIf config files are corrupted:');
console.log('1. The system should auto-restore from backup');
console.log('2. Consider remounting USB with sync option');
console.log('3. Check USB cable and port for reliability issues');
