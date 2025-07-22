#!/usr/bin/env node

/**
 * USB Stability and Power Management Tool
 * Addresses USB drive interference with WiFi and file system corruption
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawn } = require('child_process');

class USBStabilityManager {
    constructor() {
        this.logFile = '/home/openweather/usb-stability.log';
        this.usbMountPoints = ['/media/openweather/O-W', '/media/openweather'];
        this.configFile = 'ow-config.json';
        this.maxRetries = 3;
    }

    log(message) {
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp}: ${message}\n`;

        console.log(message);

        try {
            fs.appendFileSync(this.logFile, logMessage);
        } catch (err) {
            console.error('Failed to write to log file:', err);
        }
    }

    // Check if USB device is causing power issues
    async checkUSBPowerStability() {
        this.log('=== USB Power Stability Check ===');

        try {
            // Check USB device power consumption
            const lsusbOutput = execSync('lsusb -v 2>/dev/null | grep -E "(MaxPower|bDeviceClass)" || true', { encoding: 'utf8' });
            this.log('USB device power info:');
            this.log(lsusbOutput || 'No USB power info available');

            // Check for USB errors in kernel logs
            const usbErrors = execSync('dmesg | grep -i usb | tail -20 || true', { encoding: 'utf8' });
            if (usbErrors.includes('error') || usbErrors.includes('disconnect')) {
                this.log('WARNING: USB errors detected in kernel logs:');
                this.log(usbErrors);
                return false;
            }

            // Check USB hub power status
            const hubStatus = execSync('ls /sys/bus/usb/devices/*/power/control 2>/dev/null | head -5 | xargs cat 2>/dev/null || true', { encoding: 'utf8' });
            this.log(`USB power management status: ${hubStatus.trim() || 'Unknown'}`);

            return true;
        } catch (err) {
            this.log(`USB power check failed: ${err.message}`);
            return false;
        }
    }

    // Detect and repair file corruption
    async detectFileCorruption(filePath) {
        try {
            if (!fs.existsSync(filePath)) {
                this.log(`File does not exist: ${filePath}`);
                return 'missing';
            }

            const stats = fs.statSync(filePath);
            this.log(`File size: ${stats.size} bytes`);

            // Read file content
            const content = fs.readFileSync(filePath, 'utf8');

            // Check for null bytes (corruption indicator)
            if (content.includes('\0')) {
                this.log(`CORRUPTION DETECTED: File contains null bytes: ${filePath}`);
                return 'corrupted_nullbytes';
            }

            // Check for JSON validity
            if (filePath.endsWith('.json')) {
                try {
                    JSON.parse(content);
                    this.log(`JSON file is valid: ${filePath}`);
                    return 'valid';
                } catch (parseErr) {
                    this.log(`CORRUPTION DETECTED: Invalid JSON in ${filePath}: ${parseErr.message}`);
                    return 'corrupted_json';
                }
            }

            return 'valid';
        } catch (err) {
            this.log(`File corruption check failed for ${filePath}: ${err.message}`);
            return 'error';
        }
    }

    // Safely remount USB drive with sync options
    async remountUSBSafely() {
        this.log('=== USB Remount Procedure ===');

        for (const mountPoint of this.usbMountPoints) {
            try {
                if (!fs.existsSync(mountPoint)) continue;

                // Check if already mounted
                const mountCheck = execSync(`mount | grep "${mountPoint}" || true`, { encoding: 'utf8' });
                if (!mountCheck.trim()) {
                    this.log(`${mountPoint} is not mounted`);
                    continue;
                }

                this.log(`Remounting ${mountPoint} with sync options...`);

                // Force sync before unmount
                execSync('sync', { encoding: 'utf8' });

                // Unmount gracefully
                execSync(`umount "${mountPoint}" 2>/dev/null || true`, { encoding: 'utf8' });

                // Wait for unmount
                await new Promise(resolve => setTimeout(resolve, 2000));

                // Find the device for this mount point
                const device = execSync(`blkid -L "O-W" 2>/dev/null || echo ""`, { encoding: 'utf8' }).trim();
                if (device) {
                    // Remount with sync and safer options
                    execSync(`mount -o sync,rw,umask=000 "${device}" "${mountPoint}"`, { encoding: 'utf8' });
                    this.log(`Successfully remounted ${device} to ${mountPoint} with sync`);
                    return true;
                }
            } catch (err) {
                this.log(`Failed to remount ${mountPoint}: ${err.message}`);
            }
        }

        return false;
    }

    // Optimize USB power settings
    async optimizeUSBPower() {
        this.log('=== USB Power Optimization ===');

        try {
            // Disable USB autosuspend for storage devices
            const usbDevices = execSync('find /sys/bus/usb/devices -name "product" -exec dirname {} \\; 2>/dev/null || true', { encoding: 'utf8' });

            for (const devicePath of usbDevices.split('\n').filter(p => p.trim())) {
                try {
                    const productFile = path.join(devicePath.trim(), 'product');
                    if (fs.existsSync(productFile)) {
                        const product = fs.readFileSync(productFile, 'utf8').trim();

                        // Look for storage devices
                        if (product.toLowerCase().includes('storage') || product.toLowerCase().includes('disk')) {
                            const controlFile = path.join(devicePath.trim(), 'power', 'control');
                            if (fs.existsSync(controlFile)) {
                                fs.writeFileSync(controlFile, 'on');
                                this.log(`Disabled autosuspend for: ${product}`);
                            }
                        }
                    }
                } catch (err) {
                    // Continue with other devices
                    this.log(`Could not optimize power for device: ${err.message}`);
                }
            }

            // Set USB power settings via kernel parameters
            execSync('echo "on" > /sys/bus/usb/devices/*/power/control 2>/dev/null || true');
            this.log('Applied USB power optimizations');

            return true;
        } catch (err) {
            this.log(`USB power optimization failed: ${err.message}`);
            return false;
        }
    }

    // Network stability check before and after USB operations
    async checkNetworkStability() {
        this.log('=== Network Stability Check ===');

        try {
            // Check WiFi interface status
            const wifiStatus = execSync('nmcli dev wifi | head -5 || true', { encoding: 'utf8' });
            this.log('WiFi status:');
            this.log(wifiStatus);

            // Test DNS resolution
            const dnsTest = execSync('nslookup google.com 8.8.8.8 2>&1 || true', { encoding: 'utf8' });
            if (dnsTest.includes('NXDOMAIN') || dnsTest.includes('connection timed out')) {
                this.log('WARNING: DNS resolution issues detected');
                this.log(dnsTest);
                return false;
            }

            // Test connectivity
            const pingTest = execSync('ping -c 3 -W 2 8.8.8.8 2>&1 || true', { encoding: 'utf8' });
            if (pingTest.includes('100% packet loss')) {
                this.log('WARNING: Network connectivity issues detected');
                return false;
            }

            this.log('Network stability check passed');
            return true;
        } catch (err) {
            this.log(`Network stability check failed: ${err.message}`);
            return false;
        }
    }

    // Main stability check and repair routine
    async runStabilityCheck() {
        this.log('=== USB Stability Manager Started ===');

        // Check network before USB operations
        const networkBefore = await this.checkNetworkStability();

        // Check USB power stability
        const usbStable = await this.checkUSBPowerStability();

        // Optimize USB power settings
        await this.optimizeUSBPower();

        // Check for file corruption
        for (const mountPoint of this.usbMountPoints) {
            const configPath = path.join(mountPoint, this.configFile);
            const corruptionStatus = await this.detectFileCorruption(configPath);

            if (corruptionStatus === 'corrupted_nullbytes' || corruptionStatus === 'corrupted_json') {
                this.log(`Attempting to repair corrupted config file at ${configPath}`);

                // Try to remount with sync
                await this.remountUSBSafely();

                // Check backup file
                const backupPath = path.join(mountPoint, 'ow-config-backup.json');
                const backupStatus = await this.detectFileCorruption(backupPath);

                if (backupStatus === 'valid') {
                    this.log(`Restoring from backup: ${backupPath}`);
                    try {
                        fs.copyFileSync(backupPath, configPath);
                        this.log('Config file restored from backup');
                    } catch (err) {
                        this.log(`Failed to restore from backup: ${err.message}`);
                    }
                } else {
                    this.log('No valid backup available for restoration');
                }
            }
        }

        // Check network after USB operations
        const networkAfter = await this.checkNetworkStability();

        if (networkBefore && !networkAfter) {
            this.log('WARNING: Network became unstable after USB operations');
        }

        this.log('=== USB Stability Manager Completed ===');

        return {
            networkBefore,
            networkAfter,
            usbStable,
            recommendation: this.getRecommendation(networkBefore, networkAfter, usbStable)
        };
    }

    getRecommendation(networkBefore, networkAfter, usbStable) {
        if (!usbStable) {
            return 'USB_POWER_ISSUE: Consider using powered USB hub or different USB port';
        }

        if (networkBefore && !networkAfter) {
            return 'USB_INTERFERENCE: USB device is interfering with WiFi - try USB 3.0 or powered hub';
        }

        if (!networkBefore && !networkAfter) {
            return 'NETWORK_ISSUE: Network problems not related to USB';
        }

        return 'STABLE: No major stability issues detected';
    }
}

// Command line interface
if (require.main === module) {
    const manager = new USBStabilityManager();

    const command = process.argv[2] || 'check';

    switch (command) {
        case 'check':
            manager.runStabilityCheck().then(result => {
                console.log('Stability check completed');
                console.log('Recommendation:', result.recommendation);
                process.exit(result.networkAfter ? 0 : 1);
            });
            break;

        case 'power':
            manager.optimizeUSBPower().then(() => {
                console.log('USB power optimization completed');
            });
            break;

        case 'remount':
            manager.remountUSBSafely().then(success => {
                console.log('USB remount', success ? 'successful' : 'failed');
                process.exit(success ? 0 : 1);
            });
            break;

        default:
            console.log('Usage: node usb-stability.js [check|power|remount]');
            process.exit(1);
    }
}

module.exports = USBStabilityManager;
