#!/usr/bin/env node
// test-network-minimal.js - Test network functionality without LCD

const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

/**
 * Detect the actual ethernet interface name
 */
async function detectEthernetInterface() {
    try {
        const { stdout } = await execAsync('ip link show');
        const lines = stdout.split('\n');

        for (const line of lines) {
            if (line.includes(':') && line.includes('BROADCAST')) {
                const interfaceName = line.split(':')[1].trim();

                // Check if it matches ethernet patterns
                if (interfaceName.startsWith('eth') ||
                    interfaceName.startsWith('enp') ||
                    interfaceName.startsWith('enx') ||
                    interfaceName.includes('ethernet')) {
                    return interfaceName;
                }
            }
        }

        // Fallback to first non-loopback interface
        for (const line of lines) {
            if (line.includes(':') && line.includes('BROADCAST') && !line.includes('docker')) {
                const interfaceName = line.split(':')[1].trim();
                if (interfaceName !== 'lo') {
                    console.log(`Using ${interfaceName} as ethernet interface`);
                    return interfaceName;
                }
            }
        }

        return 'eth0'; // Default fallback
    } catch (error) {
        console.log('Error detecting ethernet interface, using eth0 as default');
        return 'eth0';
    }
}

/**
 * Check if a network interface exists and is up
 */
async function isInterfaceUp(interfaceName) {
    try {
        const { stdout } = await execAsync(`ip link show ${interfaceName}`);
        return stdout.includes('state UP');
    } catch (error) {
        console.log(`Interface ${interfaceName} not found or down: ${error.message}`);
        return false;
    }
}

/**
 * Check if an interface has an IP address assigned
 */
async function hasIPAddress(interfaceName) {
    try {
        const { stdout } = await execAsync(`ip addr show ${interfaceName}`);
        // Look for inet addresses that aren't localhost
        const hasIP = stdout.includes('inet ') && !stdout.includes('inet 127.');
        return hasIP;
    } catch (error) {
        console.log(`Could not check IP for ${interfaceName}: ${error.message}`);
        return false;
    }
}

/**
 * Get the IP address of a specific interface
 */
async function getInterfaceIP(interfaceName) {
    try {
        const { stdout } = await execAsync(`ip addr show ${interfaceName} | grep 'inet ' | grep -v '127.0.0.1'`);
        const match = stdout.match(/inet (\d+\.\d+\.\d+\.\d+)/);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
}

/**
 * Test internet connectivity through a specific interface
 */
async function testConnectivity(interfaceName) {
    try {
        // Ping Google DNS with a short timeout
        await execAsync(`ping -c 1 -W 3 -I ${interfaceName} 8.8.8.8`);
        return true;
    } catch (error) {
        console.log(`Connectivity test failed for ${interfaceName}: ${error.message}`);
        return false;
    }
}

async function testNetworkMinimal() {
    console.log('=== Minimal Network Test ===\n');

    try {
        console.log('1. Detecting ethernet interface...');
        const ethernetInterface = await detectEthernetInterface();
        console.log(`Detected ethernet interface: ${ethernetInterface}`);

        console.log('\n2. Testing ethernet connection...');
        const isUp = await isInterfaceUp(ethernetInterface);
        console.log(`Interface ${ethernetInterface} is up: ${isUp}`);

        if (isUp) {
            const hasIP = await hasIPAddress(ethernetInterface);
            console.log(`Interface ${ethernetInterface} has IP: ${hasIP}`);

            if (hasIP) {
                const ip = await getInterfaceIP(ethernetInterface);
                console.log(`Interface ${ethernetInterface} IP: ${ip}`);

                const hasInternet = await testConnectivity(ethernetInterface);
                console.log(`Interface ${ethernetInterface} internet connectivity: ${hasInternet}`);

                if (hasInternet) {
                    console.log('\n✅ Ethernet connection is working properly!');
                    console.log(`Connection: Ethernet (${ethernetInterface})`);
                    console.log(`IP Address: ${ip}`);
                    console.log(`Internet: Available`);
                } else {
                    console.log('\n⚠️ Ethernet has IP but no internet connectivity');
                }
            } else {
                console.log('\n❌ Ethernet interface is up but has no IP address');
            }
        } else {
            console.log('\n❌ Ethernet interface is not available or down');
        }

        console.log('\n3. Checking default route...');
        try {
            const { stdout } = await execAsync('ip route show default');
            console.log('Default routes:');
            console.log(stdout || 'No default routes found');
        } catch (error) {
            console.log('Could not get default routes');
        }

        console.log('\n4. Getting all active interfaces...');
        try {
            const { stdout } = await execAsync('ip addr show | grep "inet " | grep -v "127.0.0.1"');
            console.log('Active IP addresses:');
            console.log(stdout || 'No active IP addresses found');
        } catch (error) {
            console.log('Could not get active IP addresses');
        }

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Run the test
testNetworkMinimal().then(() => {
    console.log('\n=== Test Complete ===');
}).catch(error => {
    console.error('Test error:', error);
});
