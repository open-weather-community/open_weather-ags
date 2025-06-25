// network.js - Comprehensive network management with ethernet priority

const { exec } = require('child_process');
const { promisify } = require('util');
const { printLCD } = require('./lcd');

const execAsync = promisify(exec);

// Network interface configuration
const ETHERNET_INTERFACES = ['eth0', 'enp0s3', 'enp42s0', 'enx*']; // Common ethernet interface names
const WIFI_INTERFACES = ['wlan0', 'wlp*']; // Common wifi interface names

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
 * Detect the actual wifi interface name
 */
async function detectWifiInterface() {
    try {
        const { stdout } = await execAsync('ip link show');
        const lines = stdout.split('\n');

        for (const line of lines) {
            if (line.includes(':') && line.includes('BROADCAST')) {
                const interfaceName = line.split(':')[1].trim();

                // Check if it matches wifi patterns
                if (interfaceName.startsWith('wlan') ||
                    interfaceName.startsWith('wlp') ||
                    interfaceName.includes('wifi') ||
                    interfaceName.includes('wireless')) {
                    return interfaceName;
                }
            }
        }

        return 'wlan0'; // Default fallback
    } catch (error) {
        console.log('Error detecting wifi interface, using wlan0 as default');
        return 'wlan0';
    }
}

// Initialize interface names
let ETHERNET_INTERFACE = 'eth0';
let WIFI_INTERFACE = 'wlan0';

// Detect actual interface names at startup
(async () => {
    ETHERNET_INTERFACE = await detectEthernetInterface();
    WIFI_INTERFACE = await detectWifiInterface();
    console.log(`Detected interfaces - Ethernet: ${ETHERNET_INTERFACE}, WiFi: ${WIFI_INTERFACE}`);
})();

/**
 * Check if a network interface exists and is up
 */
async function isInterfaceUp(interfaceName) {
    // Ensure we have the latest interface names
    if (interfaceName === 'eth0' || interfaceName === 'wlan0') {
        if (interfaceName === 'eth0') {
            interfaceName = await detectEthernetInterface();
        } else {
            interfaceName = await detectWifiInterface();
        }
    }

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
    // Ensure we have the latest interface names
    if (interfaceName === 'eth0' || interfaceName === 'wlan0') {
        if (interfaceName === 'eth0') {
            interfaceName = await detectEthernetInterface();
        } else {
            interfaceName = await detectWifiInterface();
        }
    }

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
    // Ensure we have the latest interface names
    if (interfaceName === 'eth0' || interfaceName === 'wlan0') {
        if (interfaceName === 'eth0') {
            interfaceName = await detectEthernetInterface();
        } else {
            interfaceName = await detectWifiInterface();
        }
    }

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
    // Ensure we have the latest interface names
    if (interfaceName === 'eth0' || interfaceName === 'wlan0') {
        if (interfaceName === 'eth0') {
            interfaceName = await detectEthernetInterface();
        } else {
            interfaceName = await detectWifiInterface();
        }
    }

    try {
        // Use the interface's IP as source to force routing through that interface
        const ip = await getInterfaceIP(interfaceName);
        if (!ip) {
            return false;
        }

        // Ping Google DNS with a short timeout
        await execAsync(`ping -c 1 -W 3 -I ${interfaceName} 8.8.8.8`);
        return true;
    } catch (error) {
        console.log(`Connectivity test failed for ${interfaceName}: ${error.message}`);
        return false;
    }
}

/**
 * Check ethernet connection status
 */
async function checkEthernetConnection() {
    console.log('Checking ethernet connection...');

    const ethernetInterface = await detectEthernetInterface();

    const isUp = await isInterfaceUp(ethernetInterface);
    if (!isUp) {
        console.log(`Ethernet interface ${ethernetInterface} is down or not available`);
        return { connected: false, reason: 'interface_down' };
    }

    const hasIP = await hasIPAddress(ethernetInterface);
    if (!hasIP) {
        console.log(`Ethernet interface ${ethernetInterface} has no IP address`);
        return { connected: false, reason: 'no_ip' };
    }

    const ip = await getInterfaceIP(ethernetInterface);
    console.log(`Ethernet IP: ${ip}`);

    const hasInternet = await testConnectivity(ethernetInterface);
    if (!hasInternet) {
        console.log('Ethernet has IP but no internet connectivity');
        return {
            connected: true,
            ip: ip,
            internet: false,
            reason: 'no_internet'
        };
    }

    console.log('Ethernet connection verified with internet access');
    return {
        connected: true,
        ip: ip,
        internet: true,
        reason: 'success'
    };
}

/**
 * Set network interface priority (ethernet over wifi)
 */
async function setNetworkPriority() {
    try {
        console.log('Setting network priority (ethernet over wifi)...');

        // Use NetworkManager to set connection priorities if available
        try {
            // Check if NetworkManager is running
            await execAsync('systemctl is-active NetworkManager');

            // Get connection UUIDs
            const ethernetUp = await isInterfaceUp(ETHERNET_INTERFACE);
            const wifiUp = await isInterfaceUp(WIFI_INTERFACE);

            if (ethernetUp) {
                // Set ethernet connection to high priority (lower number = higher priority)
                try {
                    const { stdout } = await execAsync(`nmcli -t -f NAME,DEVICE connection show --active | grep ${ETHERNET_INTERFACE}`);
                    const ethConnectionName = stdout.split(':')[0];
                    if (ethConnectionName) {
                        await execAsync(`nmcli connection modify "${ethConnectionName}" connection.autoconnect-priority 100`);
                        console.log('Ethernet connection set to high priority (100)');
                    }
                } catch (error) {
                    console.log('Could not set ethernet priority via NetworkManager');
                }
            }

            if (wifiUp) {
                // Set wifi connection to lower priority
                try {
                    const { stdout } = await execAsync(`nmcli -t -f NAME,DEVICE connection show --active | grep ${WIFI_INTERFACE}`);
                    const wifiConnectionName = stdout.split(':')[0];
                    if (wifiConnectionName) {
                        await execAsync(`nmcli connection modify "${wifiConnectionName}" connection.autoconnect-priority 50`);
                        console.log('WiFi connection set to lower priority (50)');
                    }
                } catch (error) {
                    console.log('Could not set wifi priority via NetworkManager');
                }
            }

        } catch (nmError) {
            console.log('NetworkManager not available, using routing table approach');

            // Fallback to manual routing approach
            await setRoutingPriority();
        }

    } catch (error) {
        console.log(`Error setting network priority: ${error.message}`);
        // Continue anyway - routing may still work with default settings
    }
}

/**
 * Set routing priority manually (fallback method)
 */
async function setRoutingPriority() {
    try {
        const ethernetUp = await isInterfaceUp(ETHERNET_INTERFACE);
        const wifiUp = await isInterfaceUp(WIFI_INTERFACE);

        if (ethernetUp) {
            // Try to set ethernet as default route with lower metric
            try {
                const { stdout } = await execAsync(`ip route show dev ${ETHERNET_INTERFACE} | grep 'scope link' | head -1`);
                if (stdout.trim()) {
                    const network = stdout.trim().split(' ')[0];
                    const gateway = network.replace(/\/\d+$/, '.1'); // Assume .1 is gateway

                    // Remove existing default route for ethernet
                    await execAsync(`ip route del default dev ${ETHERNET_INTERFACE} 2>/dev/null || true`);

                    // Add new default route with metric 100 (high priority)
                    await execAsync(`ip route add default via ${gateway} dev ${ETHERNET_INTERFACE} metric 100 2>/dev/null || true`);
                    console.log('Ethernet routing priority set (metric 100)');
                }
            } catch (error) {
                console.log('Could not set ethernet routing priority');
            }
        }

        if (wifiUp) {
            // Try to set wifi as backup route with higher metric
            try {
                const { stdout } = await execAsync(`ip route show dev ${WIFI_INTERFACE} | grep 'scope link' | head -1`);
                if (stdout.trim()) {
                    const network = stdout.trim().split(' ')[0];
                    const gateway = network.replace(/\/\d+$/, '.1'); // Assume .1 is gateway

                    // Remove existing default route for wifi
                    await execAsync(`ip route del default dev ${WIFI_INTERFACE} 2>/dev/null || true`);

                    // Add new default route with metric 200 (lower priority)
                    await execAsync(`ip route add default via ${gateway} dev ${WIFI_INTERFACE} metric 200 2>/dev/null || true`);
                    console.log('WiFi routing priority set (metric 200)');
                }
            } catch (error) {
                console.log('Could not set wifi routing priority');
            }
        }

    } catch (error) {
        console.log(`Error in routing priority setup: ${error.message}`);
    }
}

/**
 * Enhanced wifi check that respects ethernet priority
 */
async function checkWifiConnection(config) {
    console.log('Checking WiFi connection...');

    // Check if ethernet is already working
    const ethernetStatus = await checkEthernetConnection();
    if (ethernetStatus.connected && ethernetStatus.internet) {
        console.log('Ethernet already provides connectivity, skipping WiFi connection');
        return { connected: false, reason: 'ethernet_available' };
    }

    // Import wifi functions here to avoid circular imports
    const {
        checkWifiConnection: originalCheckWifiConnection,
        verifyWifiConnection
    } = require('./wifi');

    // Proceed with original wifi connection logic
    try {
        await originalCheckWifiConnection(config);

        // Verify wifi is working
        const wifiConnected = await verifyWifiConnection();
        if (wifiConnected) {
            const ip = await getInterfaceIP(WIFI_INTERFACE);
            console.log(`WiFi connected with IP: ${ip}`);
            return { connected: true, ip: ip, internet: true, reason: 'success' };
        }

        return { connected: false, reason: 'verification_failed' };
    } catch (error) {
        console.error(`WiFi connection failed: ${error.message}`);
        return { connected: false, reason: 'connection_failed', error: error.message };
    }
}

/**
 * Get current network status and display on LCD
 */
async function getNetworkStatus() {
    const status = {
        ethernet: { connected: false },
        wifi: { connected: false },
        primary: null,
        ip: null
    };

    // Check ethernet
    const ethernetResult = await checkEthernetConnection();
    status.ethernet = ethernetResult;

    // Check wifi
    const wifiInterface = await detectWifiInterface();
    const wifiUp = await isInterfaceUp(wifiInterface);
    if (wifiUp) {
        const wifiHasIP = await hasIPAddress(wifiInterface);
        if (wifiHasIP) {
            const wifiIP = await getInterfaceIP(wifiInterface);
            const wifiInternet = await testConnectivity(wifiInterface);
            status.wifi = {
                connected: true,
                ip: wifiIP,
                internet: wifiInternet,
                reason: wifiInternet ? 'success' : 'no_internet'
            };
        }
    }

    // Determine primary connection
    if (status.ethernet.connected && status.ethernet.internet) {
        status.primary = 'ethernet';
        status.ip = status.ethernet.ip;
    } else if (status.wifi.connected && status.wifi.internet) {
        status.primary = 'wifi';
        status.ip = status.wifi.ip;
    } else if (status.ethernet.connected) {
        status.primary = 'ethernet';
        status.ip = status.ethernet.ip;
    } else if (status.wifi.connected) {
        status.primary = 'wifi';
        status.ip = status.wifi.ip;
    }

    return status;
}

/**
 * Get network status (no longer displays on LCD)
 * LCD display is handled by AGS READY message in scheduler
 */
async function displayNetworkStatus() {
    const status = await getNetworkStatus();

    if (status.primary) {
        const connectionType = status.primary.toUpperCase();
        console.log(`Network status: ${connectionType} connection active with IP ${status.ip}`);
    } else {
        console.log('Network status: No active network connections');
    }

    return status;
}

/**
 * Initialize network connections with proper priority
 */
async function initializeNetwork(config) {
    console.log('Initializing network connections...');
    printLCD('Network Setup', 'Starting...');

    let networkEstablished = false;

    try {
        // Step 1: Check ethernet first (highest priority)
        console.log('Step 1: Checking ethernet connection...');
        printLCD('Checking', 'Ethernet...');

        const ethernetStatus = await checkEthernetConnection();

        if (ethernetStatus.connected) {
            if (ethernetStatus.internet) {
                console.log('Ethernet connection established with internet access');
                printLCD('Ethernet OK', `IP: ${ethernetStatus.ip}`);
                networkEstablished = true;
            } else {
                console.log('Ethernet connected but no internet access');
                printLCD('Ethernet: Local', 'only');
                // Continue to try WiFi for internet
            }
        } else {
            console.log('Ethernet not available, trying WiFi...');
            printLCD('Ethernet: None', 'Trying WiFi...');
        }

        // Step 2: Try WiFi if ethernet doesn't provide internet
        if (!networkEstablished && config.wifiName) {
            console.log('Step 2: Setting up WiFi connection...');

            const wifiResult = await checkWifiConnection(config);

            if (wifiResult.connected && wifiResult.internet) {
                console.log('WiFi connection established with internet access');
                networkEstablished = true;
            } else if (wifiResult.reason === 'ethernet_available') {
                console.log('Skipped WiFi setup due to working ethernet connection');
                networkEstablished = ethernetStatus.internet;
            } else {
                console.log(`WiFi connection failed: ${wifiResult.reason}`);
            }
        }

        // Step 3: Set routing priority and display final status
        await setNetworkPriority();

        // Wait a moment for routes to settle
        await new Promise(resolve => setTimeout(resolve, 2000));

        const finalStatus = await displayNetworkStatus();

        if (finalStatus.primary) {
            console.log(`Network initialization complete: ${finalStatus.primary} connection active`);
            return { success: true, connection: finalStatus.primary, ip: finalStatus.ip };
        } else {
            console.log('Network initialization failed: No working connections');
            return { success: false, error: 'No network connections available' };
        }

    } catch (error) {
        console.error(`Network initialization error: ${error.message}`);
        printLCD('Network Error', 'Check config');
        return { success: false, error: error.message };
    }
}

/**
 * Get the current system's IP address (from any active interface)
 */
async function getMyIP() {
    // First try ethernet
    const ethernetInterface = await detectEthernetInterface();
    const ethernetIP = await getInterfaceIP(ethernetInterface);
    if (ethernetIP) {
        return ethernetIP;
    }

    // Then try wifi
    const wifiInterface = await detectWifiInterface();
    const wifiIP = await getInterfaceIP(wifiInterface);
    if (wifiIP) {
        return wifiIP;
    }

    // Fallback to any interface with an IP
    try {
        const { stdout } = await execAsync("ip route get 8.8.8.8 | awk '{print $7}' | head -1");
        const ip = stdout.trim();
        if (ip && ip !== '8.8.8.8') {
            return ip;
        }
    } catch (error) {
        console.log('Could not determine IP address via routing table');
    }

    return null;
}

/**
 * Monitor network status and update LCD periodically
 */
function startNetworkMonitoring(intervalMinutes = 5) {
    console.log(`Starting network monitoring (every ${intervalMinutes} minutes)`);

    const monitor = setInterval(async () => {
        try {
            await displayNetworkStatus();
        } catch (error) {
            console.error(`Network monitoring error: ${error.message}`);
        }
    }, intervalMinutes * 60 * 1000);

    return monitor;
}

module.exports = {
    initializeNetwork,
    checkEthernetConnection,
    checkWifiConnection,
    getNetworkStatus,
    displayNetworkStatus,
    getMyIP,
    startNetworkMonitoring,
    setNetworkPriority,
    setRoutingPriority
};
