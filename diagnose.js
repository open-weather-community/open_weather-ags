#!/usr/bin/env node

// diagnose.js - AGS Diagnostic Tool
// This script helps diagnose common issues found in production AGS systems

const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');
const path = require('path');

const execAsync = promisify(exec);

console.log('OpenWeather AGS Diagnostic Tool');
console.log('================================');
console.log('This tool helps diagnose common issues found in production systems.\n');

async function checkDNS() {
    console.log('🔍 Checking DNS resolution...');
    try {
        const { stdout } = await execAsync('nslookup celestrak.org');
        if (stdout.includes('NXDOMAIN') || stdout.includes('can\'t find')) {
            console.log('❌ DNS resolution failed for celestrak.org');
            console.log('   This indicates the EAI_AGAIN error condition');
            return false;
        } else {
            console.log('✅ DNS resolution working for celestrak.org');
            return true;
        }
    } catch (error) {
        console.log('❌ DNS resolution failed:', error.message);
        return false;
    }
}

async function checkNetworkInterfaces() {
    console.log('\n🔍 Checking network interfaces...');
    try {
        const { stdout } = await execAsync('ip link show');
        const lines = stdout.split('\n');

        let hasEthernet = false;
        let hasWifi = false;

        for (const line of lines) {
            if (line.includes(':') && line.includes('BROADCAST')) {
                const interfaceName = line.split(':')[1].trim();

                if (interfaceName.startsWith('eth') || interfaceName.startsWith('enp') || interfaceName.startsWith('enx')) {
                    console.log(`📶 Found ethernet interface: ${interfaceName}`);
                    hasEthernet = true;
                } else if (interfaceName.startsWith('wlan') || interfaceName.startsWith('wlp')) {
                    console.log(`📶 Found wifi interface: ${interfaceName}`);
                    hasWifi = true;
                }
            }
        }

        if (!hasEthernet && !hasWifi) {
            console.log('❌ No network interfaces found');
            return false;
        }

        return { hasEthernet, hasWifi };
    } catch (error) {
        console.log('❌ Failed to check network interfaces:', error.message);
        return false;
    }
}

async function checkUSBDrives() {
    console.log('\n🔍 Checking USB drives...');
    try {
        // Check common mount points
        const mountPoints = ['/media', '/mnt'];
        let foundUSB = false;

        for (const mountPoint of mountPoints) {
            if (fs.existsSync(mountPoint)) {
                const dirs = fs.readdirSync(mountPoint);
                for (const dir of dirs) {
                    const fullPath = path.join(mountPoint, dir);
                    if (fs.statSync(fullPath).isDirectory()) {
                        console.log(`💾 Found USB mount: ${fullPath}`);

                        // Check for config files
                        const configPath = path.join(fullPath, 'ow-config.json');
                        const backupPath = path.join(fullPath, 'ow-config-backup.json');

                        if (fs.existsSync(configPath)) {
                            console.log(`  ✅ Found config file: ${configPath}`);
                        } else {
                            console.log(`  ❌ No config file found at: ${configPath}`);
                        }

                        if (fs.existsSync(backupPath)) {
                            console.log(`  ✅ Found backup config: ${backupPath}`);
                        } else {
                            console.log(`  ⚠️  No backup config found at: ${backupPath}`);
                        }

                        foundUSB = true;
                    }
                }
            }
        }

        if (!foundUSB) {
            console.log('❌ No USB drives found in common mount points');
            return false;
        }

        return true;
    } catch (error) {
        console.log('❌ Failed to check USB drives:', error.message);
        return false;
    }
}

async function checkSystemResources() {
    console.log('\n🔍 Checking system resources...');
    try {
        // Check memory
        const { stdout: memInfo } = await execAsync('free -h');
        console.log('Memory usage:');
        console.log(memInfo);

        // Check disk space
        const { stdout: diskInfo } = await execAsync('df -h');
        console.log('\nDisk usage:');
        console.log(diskInfo);

        // Check load average
        const { stdout: loadInfo } = await execAsync('uptime');
        console.log('\nSystem load:');
        console.log(loadInfo.trim());

        return true;
    } catch (error) {
        console.log('❌ Failed to check system resources:', error.message);
        return false;
    }
}

async function checkCachedTLE() {
    console.log('\n🔍 Checking for cached TLE data...');
    try {
        // Check common USB mount points for TLE cache
        const mountPoints = ['/media', '/mnt'];

        for (const mountPoint of mountPoints) {
            if (fs.existsSync(mountPoint)) {
                const dirs = fs.readdirSync(mountPoint);
                for (const dir of dirs) {
                    const cachePath = path.join(mountPoint, dir, 'tle_cache.txt');
                    if (fs.existsSync(cachePath)) {
                        const stats = fs.statSync(cachePath);
                        const age = (Date.now() - stats.mtime.getTime()) / (1000 * 60 * 60 * 24);
                        console.log(`📡 Found TLE cache: ${cachePath}`);
                        console.log(`   Age: ${age.toFixed(1)} days`);

                        if (age > 7) {
                            console.log('   ⚠️  Cache is older than 7 days');
                        } else {
                            console.log('   ✅ Cache is recent');
                        }
                        return true;
                    }
                }
            }
        }

        console.log('⚠️  No TLE cache found - system will need network for satellite data');
        return false;
    } catch (error) {
        console.log('❌ Failed to check TLE cache:', error.message);
        return false;
    }
}

async function testCelestrakConnection() {
    console.log('\n🔍 Testing Celestrak connection...');
    try {
        const { stdout } = await execAsync('curl -s -w "%{http_code}" --connect-timeout 10 --max-time 30 "https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle" -o /dev/null');
        const statusCode = stdout.trim();

        if (statusCode === '200') {
            console.log('✅ Celestrak connection successful');
            return true;
        } else {
            console.log(`❌ Celestrak returned HTTP ${statusCode}`);
            return false;
        }
    } catch (error) {
        console.log('❌ Celestrak connection failed:', error.message);
        console.log('   This indicates the network issue that causes "updating passes" freeze');
        return false;
    }
}

async function checkUSBWiFiInteraction() {
    console.log('\n🔍 Checking USB/WiFi interaction...');
    try {
        // Check for USB storage devices
        const { stdout: lsusbOutput } = await execAsync('lsusb');
        const storageDevices = lsusbOutput.split('\n').filter(line =>
            line.includes('Storage') ||
            line.includes('Mass') ||
            line.includes('Flash') ||
            line.includes('Disk')
        );

        if (storageDevices.length > 0) {
            console.log(`📱 Found ${storageDevices.length} USB storage device(s)`);

            // Test WiFi scan while USB is connected
            try {
                console.log('   Testing WiFi scan with USB connected...');
                await execAsync('nmcli device wifi rescan');
                await new Promise(resolve => setTimeout(resolve, 5000));

                const { stdout: scanResults } = await execAsync('nmcli -t -f ssid device wifi list');
                const networks = scanResults.split('\n').filter(line => line.trim() && line !== '--');

                if (networks.length > 0) {
                    console.log(`✅ WiFi scan successful: ${networks.length} networks found`);
                    console.log('   USB/WiFi interaction appears normal');
                    return true;
                } else {
                    console.log('❌ WiFi scan returned no results with USB connected');
                    console.log('   This suggests USB/WiFi interference');
                    console.log('   Known issue: WiFi may work without USB but fail with USB');
                    return false;
                }
            } catch (error) {
                console.log(`❌ WiFi scan failed with USB connected: ${error.message}`);
                console.log('   This confirms USB/WiFi interference issue');
                return false;
            }
        } else {
            console.log('ℹ️  No USB storage devices detected');
            console.log('   Cannot test USB/WiFi interaction');
            return true;
        }
    } catch (error) {
        console.log(`❌ Failed to check USB/WiFi interaction: ${error.message}`);
        return false;
    }
}

async function main() {
    const results = {};

    results.dns = await checkDNS();
    results.interfaces = await checkNetworkInterfaces();
    results.usb = await checkUSBDrives();
    results.resources = await checkSystemResources();
    results.tleCache = await checkCachedTLE();
    results.celestrak = await testCelestrakConnection();
    results.usbWifiInteraction = await checkUSBWiFiInteraction();

    console.log('\n📋 Diagnostic Summary');
    console.log('====================');

    if (!results.dns) {
        console.log('🚨 DNS Resolution Failed - This is the EAI_AGAIN error condition');
        console.log('   - Check network configuration');
        console.log('   - Verify internet connectivity');
        console.log('   - Try restarting network services');
    }

    if (!results.interfaces) {
        console.log('🚨 Network Interface Issues Detected');
        console.log('   - Check network hardware connections');
        console.log('   - Verify network configuration');
    }

    if (!results.usb) {
        console.log('🚨 USB Configuration Issues');
        console.log('   - Mount USB drive with ow-config.json');
        console.log('   - Check USB drive permissions');
    }

    if (!results.celestrak) {
        console.log('🚨 Celestrak Connection Failed');
        console.log('   - This causes "updating passes" freeze');
        if (results.tleCache) {
            console.log('   - TLE cache available, system should use cached data');
        } else {
            console.log('   - No TLE cache, system may fail to start');
        }
    }

    if (!results.usbWifiInteraction) {
        console.log('🚨 USB/WiFi Interference Detected');
        console.log('   - WiFi fails when USB storage is connected');
        console.log('   - Known hardware issue on some Raspberry Pi setups');
        console.log('   - Solutions:');
        console.log('     • Use powered USB hub');
        console.log('     • Try different USB ports');
        console.log('     • Use USB 3.0 devices instead of USB 2.0');
        console.log('     • Physically separate USB from WiFi antenna');
    }

    if (results.dns && results.interfaces && results.usb && results.celestrak && results.usbWifiInteraction) {
        console.log('✅ All checks passed - system should be operational');
    } else {
        console.log('⚠️  Issues detected - see recommendations above');
    }

    console.log('\nFor more help, check the troubleshooting guide in plan.md');
}

main().catch(console.error);
