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

// Initialize interface names - will be detected when needed
let ETHERNET_INTERFACE = null;
let WIFI_INTERFACE = null;

// Cached interface detection to avoid repeated detection
let interfaceDetectionPromise = null;

/**
 * Ensure interfaces are detected and cached
 */
async function ensureInterfacesDetected() {
    if (interfaceDetectionPromise) {
        return interfaceDetectionPromise;
    }

    interfaceDetectionPromise = (async () => {
        if (!ETHERNET_INTERFACE) {
            ETHERNET_INTERFACE = await detectEthernetInterface();
        }
        if (!WIFI_INTERFACE) {
            WIFI_INTERFACE = await detectWifiInterface();
        }
        console.log(`Detected interfaces - Ethernet: ${ETHERNET_INTERFACE}, WiFi: ${WIFI_INTERFACE}`);
        return { ethernet: ETHERNET_INTERFACE, wifi: WIFI_INTERFACE };
    })();

    return interfaceDetectionPromise;
}

/**
 * Check if a network interface exists and is up
 */
async function isInterfaceUp(interfaceName) {
    // Ensure interfaces are detected if using generic names
    if (!interfaceName || interfaceName === 'eth0' || interfaceName === 'wlan0') {
        await ensureInterfacesDetected();
        if (!interfaceName || interfaceName === 'eth0') {
            interfaceName = ETHERNET_INTERFACE;
        } else if (interfaceName === 'wlan0') {
            interfaceName = WIFI_INTERFACE;
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
    // Ensure interfaces are detected if using generic names
    if (!interfaceName || interfaceName === 'eth0' || interfaceName === 'wlan0') {
        await ensureInterfacesDetected();
        if (!interfaceName || interfaceName === 'eth0') {
            interfaceName = ETHERNET_INTERFACE;
        } else if (interfaceName === 'wlan0') {
            interfaceName = WIFI_INTERFACE;
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
    // Ensure interfaces are detected if using generic names
    if (!interfaceName || interfaceName === 'eth0' || interfaceName === 'wlan0') {
        await ensureInterfacesDetected();
        if (!interfaceName || interfaceName === 'eth0') {
            interfaceName = ETHERNET_INTERFACE;
        } else if (interfaceName === 'wlan0') {
            interfaceName = WIFI_INTERFACE;
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
    // Ensure interfaces are detected if using generic names
    if (!interfaceName || interfaceName === 'eth0' || interfaceName === 'wlan0') {
        await ensureInterfacesDetected();
        if (!interfaceName || interfaceName === 'eth0') {
            interfaceName = ETHERNET_INTERFACE;
        } else if (interfaceName === 'wlan0') {
            interfaceName = WIFI_INTERFACE;
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
 * Test internet connectivity through specific interface without logging
 */
async function testConnectivityQuiet(interfaceName) {
    try {
        // Ensure interfaces are detected if using generic names
        if (!interfaceName || interfaceName === 'eth0' || interfaceName === 'wlan0') {
            await ensureInterfacesDetected();
            if (!interfaceName || interfaceName === 'eth0') {
                interfaceName = ETHERNET_INTERFACE;
            } else if (interfaceName === 'wlan0') {
                interfaceName = WIFI_INTERFACE;
            }
        }

        if (!interfaceName) {
            return false;
        }

        // Ping Google DNS with a short timeout
        await execAsync(`ping -c 1 -W 3 -I ${interfaceName} 8.8.8.8`);
        return true;
    } catch (error) {
        return false;
    }
}

/**
 * Check ethernet connection status
 */
async function checkEthernetConnection(logger = null) {
    if (logger) {
        logger.info('Checking ethernet connection...');
    } else {
        console.log('Checking ethernet connection...');
    }

    // Ensure interfaces are detected
    await ensureInterfacesDetected();
    const ethernetInterface = ETHERNET_INTERFACE;

    const isUp = await isInterfaceUp(ethernetInterface);
    if (!isUp) {
        if (logger) {
            logger.info(`Ethernet interface ${ethernetInterface} is down or not available`);
        } else {
            console.log(`Ethernet interface ${ethernetInterface} is down or not available`);
        }
        return { connected: false, reason: 'interface_down' };
    }

    const hasIP = await hasIPAddress(ethernetInterface);
    if (!hasIP) {
        if (logger) {
            logger.info(`Ethernet interface ${ethernetInterface} has no IP address`);
        } else {
            console.log(`Ethernet interface ${ethernetInterface} has no IP address`);
        }
        return { connected: false, reason: 'no_ip' };
    }

    const ip = await getInterfaceIP(ethernetInterface);
    if (logger) {
        logger.info(`Ethernet IP: ${ip}`);
    } else {
        console.log(`Ethernet IP: ${ip}`);
    }

    // Test internet connectivity
    const internet = await testConnectivity(ethernetInterface);

    return {
        connected: true,
        ip: ip,
        internet: internet,
        reason: internet ? 'success' : 'no_internet'
    };
}

/**
 * Check ethernet connection status without verbose logging (for monitoring)
 */
async function checkEthernetConnectionQuiet() {
    // Ensure interfaces are detected
    await ensureInterfacesDetected();
    const ethernetInterface = ETHERNET_INTERFACE;

    const isUp = await isInterfaceUp(ethernetInterface);
    if (!isUp) {
        return { connected: false, reason: 'interface_down' };
    }

    const hasIP = await hasIPAddress(ethernetInterface);
    if (!hasIP) {
        return { connected: false, reason: 'no_ip' };
    }

    const ip = await getInterfaceIP(ethernetInterface);
    const internet = await testConnectivityQuiet(ethernetInterface);

    return {
        connected: true,
        ip: ip,
        internet: internet,
        reason: internet ? 'success' : 'no_internet'
    };
}

/**
 * Test internet connectivity through specific interface without logging
 */

/**
 * Get network status from preferred interface without detailed logging
 */
async function getNetworkStatusQuiet() {
    try {
        await ensureInterfacesDetected();

        // Check ethernet first
        if (ETHERNET_INTERFACE) {
            const ethConnected = await checkEthernetConnectionQuiet();
            if (ethConnected.connected) {
                const ethInternet = await testConnectivityQuiet(ETHERNET_INTERFACE);
                if (ethInternet) {
                    return { connected: true, interface: 'ethernet', internet: true };
                }
                return { connected: true, interface: 'ethernet', internet: false };
            }
        }

        // Check wifi if ethernet not available
        if (WIFI_INTERFACE) {
            const wifiConnected = await checkWifiConnection();
            if (wifiConnected.connected) {
                const wifiInternet = await testConnectivityQuiet(WIFI_INTERFACE);
                return {
                    connected: true,
                    interface: 'wifi',
                    internet: wifiInternet,
                    ssid: wifiConnected.ssid
                };
            }
        }

        return { connected: false, interface: 'none', internet: false };
    } catch (error) {
        return { connected: false, interface: 'error', internet: false, error: error.message };
    }
}

/**
 * Set network interface priority (ethernet over wifi)
 * Only sets priorities when both interfaces are available and connected
 */
async function setNetworkPriority() {
    try {
        // Use NetworkManager to set connection priorities if available
        try {
            // Check if NetworkManager is running
            await execAsync('systemctl is-active NetworkManager');

            // Get connection status for both interfaces
            const ethernetUp = await isInterfaceUp(ETHERNET_INTERFACE);
            const wifiUp = await isInterfaceUp(WIFI_INTERFACE);

            // Check if ethernet also has internet connectivity
            let ethernetHasInternet = false;
            if (ethernetUp) {
                const ethernetStatus = await checkEthernetConnection();
                ethernetHasInternet = ethernetStatus.connected && ethernetStatus.internet;
            }

            // Only set priorities if both interfaces are up and ethernet has internet
            if (ethernetUp && ethernetHasInternet && wifiUp) {
                console.log('Setting network priority (ethernet over wifi) - both interfaces active...');

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
            } else if (wifiUp && !ethernetHasInternet) {
                console.log('WiFi is primary connection (ethernet not available or no internet) - maintaining default priority');
            } else if (ethernetUp && ethernetHasInternet && !wifiUp) {
                console.log('Ethernet is only connection - no priority adjustment needed');
            } else {
                console.log('No active network connections found for priority setting');
            }

        } catch (nmError) {
            console.log('NetworkManager not available, using routing table approach');

            // Fallback to manual routing approach - but only if both interfaces are up
            const ethernetUp = await isInterfaceUp(ETHERNET_INTERFACE);
            const wifiUp = await isInterfaceUp(WIFI_INTERFACE);

            if (ethernetUp && wifiUp) {
                await setRoutingPriority();
            } else {
                console.log('Skipping routing priority - not both interfaces active');
            }
        }

    } catch (error) {
        console.log(`Error setting network priority: ${error.message}`);
        // Continue anyway - routing may still work with default settings
    }
}

/**
 * Set routing priority manually (fallback method)
 * Should only be called when both ethernet and wifi are up and ethernet has internet
 */
async function setRoutingPriority() {
    try {
        console.log('Setting routing priority (ethernet over wifi) using ip route commands...');
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
 * Enhanced wifi check that respects ethernet priority and existing connections
 */
async function checkWifiConnection(config) {
    console.log(`=== WiFi Connection Check Started ===`);
    console.log(`Target network: "${config.wifiName}"`);

    // Check if ethernet is already working
    const ethernetStatus = await checkEthernetConnection();
    if (ethernetStatus.connected && ethernetStatus.internet) {
        console.log(`Ethernet already provides connectivity, skipping WiFi connection to "${config.wifiName}"`);
        return { connected: false, reason: 'ethernet_available' };
    }

    // Import wifi functions here to avoid circular imports
    const {
        checkWifiConnection: originalCheckWifiConnection,
        verifyWifiConnection
    } = require('./wifi');

    try {
        // Ensure interfaces are detected
        await ensureInterfacesDetected();

        // Check if we're already properly connected to the target WiFi
        console.log('Checking current WiFi status before attempting connection...');
        const wifiStatus = await getNetworkStatus();

        if (wifiStatus.wifi.connected) {
            console.log(`Currently connected to WiFi: "${wifiStatus.wifi.ssid}"`);

            if (wifiStatus.wifi.ssid === config.wifiName) {
                console.log(`Already connected to target WiFi network: ${config.wifiName}`);

                // Verify the connection is actually working
                const connectionWorking = await verifyWifiConnection();
                if (connectionWorking && wifiStatus.wifi.internet) {
                    console.log('Current WiFi connection verified and has internet access, preserving connection');
                    return { connected: true, internet: true, reason: 'already_connected' };
                } else {
                    console.log('Current WiFi connection failed verification or lacks internet, will reconnect');
                }
            } else {
                console.log(`Connected to different WiFi (${wifiStatus.wifi.ssid}), switching to target: ${config.wifiName}`);
            }
        } else {
            console.log('No active WiFi connection detected, proceeding with setup');
        }

        // Only proceed with WiFi setup if we need to connect/reconnect
        await originalCheckWifiConnection(config);

        // Verify wifi is working
        const wifiConnected = await verifyWifiConnection();
        if (wifiConnected) {
            const ip = await getInterfaceIP(WIFI_INTERFACE);
            console.log(`WiFi successfully connected to "${config.wifiName}" with IP: ${ip}`);
            return { connected: true, ip: ip, internet: true, reason: 'success' };
        }

        console.log(`WiFi connection to "${config.wifiName}" failed verification`);
        return { connected: false, reason: 'verification_failed' };
    } catch (error) {
        console.error(`WiFi connection failed for "${config.wifiName}": ${error.message}`);
        return { connected: false, reason: 'connection_failed', error: error.message };
    }
}

/**
 * Get the current WiFi SSID (if connected)
 */
async function getWifiSSID() {
    try {
        // Use nmcli to get the currently active WiFi SSID
        const { stdout } = await execAsync('/usr/bin/nmcli -t -f active,ssid dev wifi');
        const activeConnections = stdout.split('\n').filter(line => line.startsWith('yes'));

        if (activeConnections.length > 0) {
            const ssid = activeConnections[0].split(':')[1];
            return ssid || null;
        }

        return null;
    } catch (error) {
        console.log(`Error getting WiFi SSID: ${error.message}`);
        return null;
    }
}

/**
 * Get current network status and display on LCD
 */
async function getNetworkStatus(logger = null) {
    const status = {
        ethernet: { connected: false },
        wifi: { connected: false },
        primary: null,
        ip: null
    };

    // Check ethernet
    const ethernetResult = await checkEthernetConnection(logger);
    status.ethernet = ethernetResult;

    // Check wifi
    await ensureInterfacesDetected();
    const wifiInterface = WIFI_INTERFACE;
    const wifiUp = await isInterfaceUp(wifiInterface);
    if (wifiUp) {
        const wifiHasIP = await hasIPAddress(wifiInterface);
        if (wifiHasIP) {
            const wifiIP = await getInterfaceIP(wifiInterface);
            const wifiInternet = await testConnectivity(wifiInterface);
            const currentSSID = await getWifiSSID();
            status.wifi = {
                connected: true,
                ip: wifiIP,
                internet: wifiInternet,
                ssid: currentSSID,
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
async function displayNetworkStatus(logger = null) {
    try {
        // Get status without verbose logging during monitoring
        const status = await getNetworkStatusQuiet();

        if (status.primary) {
            const connectionType = status.primary.toUpperCase();
            if (logger) {
                logger.info(`Network: ${connectionType} connection active (IP: ${status.ip})`);
            } else {
                console.log(`Network: ${connectionType} connection active (IP: ${status.ip})`);
            }
        } else {
            if (logger) {
                logger.info('Network: No active connections');
            } else {
                console.log('Network: No active connections');
            }
        }

        return status;
    } catch (error) {
        if (logger) {
            logger.error(`Network monitoring error: ${error.message}`);
        } else {
            console.error(`Network monitoring error: ${error.message}`);
        }
        return null;
    }
}

/**
 * Initialize network connections with proper priority and timeout protection
 */
async function initializeNetwork(config, logger = null) {
    if (logger) {
        logger.info('Initializing network connections...');
    } else {
        console.log('Initializing network connections...');
    }
    printLCD('Network Setup', 'Starting...');

    // Add overall timeout for network initialization
    const initTimeout = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Network initialization timeout after 90 seconds')), 90000);
    });

    const initProcess = (async () => {
        let networkEstablished = false;

        try {
            // Ensure interfaces are detected first with timeout
            console.log('Detecting network interfaces...');
            await Promise.race([
                ensureInterfacesDetected(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Interface detection timeout')), 15000))
            ]);

            // Step 1: Check ethernet first (highest priority) with timeout
            if (logger) {
                logger.info('Step 1: Checking ethernet connection...');
            } else {
                console.log('Step 1: Checking ethernet connection...');
            }
            printLCD('Checking', 'Ethernet...');

            const ethernetPromise = checkEthernetConnection(logger);
            const ethernetTimeout = new Promise((_, reject) => {
                setTimeout(() => reject(new Error('Ethernet check timeout')), 20000);
            });

            let ethernetStatus;
            try {
                ethernetStatus = await Promise.race([ethernetPromise, ethernetTimeout]);
            } catch (ethError) {
                console.log(`Ethernet check failed: ${ethError.message}`);
                ethernetStatus = { connected: false, reason: 'check_failed' };
            }

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

            // Step 2: Try WiFi if ethernet doesn't provide internet and WiFi is configured
            if (!networkEstablished && config.wifiName && config.wifiName.trim() !== '') {
                console.log(`Step 2: Setting up WiFi connection to "${config.wifiName}"...`);

                // Log USB information for debugging USB/WiFi interference issues
                try {
                    const { stdout: lsusbOutput } = await execAsync('lsusb');
                    const usbDevices = lsusbOutput.split('\n').filter(line => line.trim());
                    console.log(`USB devices currently connected: ${usbDevices.length}`);
                    const storageDevices = usbDevices.filter(line =>
                        line.includes('Storage') || line.includes('Mass') || line.includes('Flash')
                    );
                    if (storageDevices.length > 0) {
                        console.log(`USB storage devices detected: ${storageDevices.length}`);
                        console.log('Note: USB storage can sometimes interfere with WiFi on some hardware');
                    }
                } catch (error) {
                    console.log('Could not enumerate USB devices for debugging');
                }

                const wifiPromise = checkWifiConnection(config);
                const wifiTimeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('WiFi setup timeout after 30 seconds')), 30000);
                });

                let wifiResult;
                try {
                    wifiResult = await Promise.race([wifiPromise, wifiTimeout]);
                } catch (wifiError) {
                    console.log(`WiFi setup failed for "${config.wifiName}": ${wifiError.message}`);
                    if (wifiError.message.includes('timeout')) {
                        console.log('WiFi setup timed out - this may indicate hardware issues or USB interference');
                    }
                    wifiResult = { connected: false, reason: 'setup_failed', error: wifiError.message };
                }

                if (wifiResult.connected && wifiResult.internet) {
                    if (wifiResult.reason === 'already_connected') {
                        console.log(`WiFi connection preserved to "${config.wifiName}" - already connected with internet access`);
                    } else {
                        console.log(`WiFi connection established with internet access to "${config.wifiName}"`);
                    }
                    networkEstablished = true;
                } else if (wifiResult.reason === 'ethernet_available') {
                    console.log('Skipped WiFi setup due to working ethernet connection');
                    networkEstablished = ethernetStatus.internet;
                } else {
                    console.log(`WiFi connection failed for "${config.wifiName}": ${wifiResult.reason}`);
                    if (wifiResult.error) {
                        console.log(`WiFi error details: ${wifiResult.error}`);
                    }
                }
            } else if (!config.wifiName || config.wifiName.trim() === '') {
                console.log('No WiFi configuration provided, skipping WiFi setup');
                console.log('To enable WiFi, add "wifiName" and "wifiPassword" to your configuration');
            }

            // Step 3: Set routing priority and display final status
            try {
                await Promise.race([
                    setNetworkPriority(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('Priority setting timeout')), 10000))
                ]);
            } catch (priorityError) {
                console.log(`Warning: Could not set network priority: ${priorityError.message}`);
                // Not critical, continue
            }

            // Wait a moment for routes to settle
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Get final status with timeout
            let finalStatus;
            try {
                const statusPromise = displayNetworkStatus(logger);
                const statusTimeout = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Status check timeout')), 10000);
                });
                finalStatus = await Promise.race([statusPromise, statusTimeout]);
            } catch (statusError) {
                console.log(`Warning: Could not get network status: ${statusError.message}`);
                // Try to determine if we have any connection
                finalStatus = { primary: networkEstablished ? 'unknown' : null };
            }

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
    })();

    try {
        return await Promise.race([initProcess, initTimeout]);
    } catch (error) {
        console.error(`Network initialization failed: ${error.message}`);
        printLCD('Network Timeout', 'Continuing...');
        return { success: false, error: error.message };
    }
}

/**
 * Get the current system's IP address (from any active interface)
 */
async function getMyIP() {
    // Ensure interfaces are detected
    await ensureInterfacesDetected();

    // First try ethernet
    const ethernetIP = await getInterfaceIP(ETHERNET_INTERFACE);
    if (ethernetIP) {
        return ethernetIP;
    }

    // Then try wifi
    const wifiIP = await getInterfaceIP(WIFI_INTERFACE);
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
function startNetworkMonitoring(intervalMinutes = 5, logger = null) {
    if (logger) {
        logger.info(`Starting network monitoring (every ${intervalMinutes} minutes)`);
    } else {
        console.log(`Starting network monitoring (every ${intervalMinutes} minutes)`);
    }

    const monitor = setInterval(async () => {
        try {
            await displayNetworkStatus(logger);
        } catch (error) {
            if (logger) {
                logger.error(`Network monitoring error: ${error.message}`);
            } else {
                console.error(`Network monitoring error: ${error.message}`);
            }
        }
    }, intervalMinutes * 60 * 1000);

    return monitor;
}

/**
 * Monitor network status with quiet, condensed output
 */
function startNetworkMonitoringQuiet(intervalMinutes = 30, logger = null) {
    if (logger) {
        logger.info(`Starting quiet network monitoring (every ${intervalMinutes} minutes)`);
    } else {
        console.log(`Starting quiet network monitoring (every ${intervalMinutes} minutes)`);
    }

    const monitor = setInterval(async () => {
        try {
            const status = await getNetworkStatusQuiet();
            let message = '';

            if (status.connected) {
                if (status.interface === 'ethernet') {
                    message = `Network: Ethernet connected ${status.internet ? 'with internet' : 'no internet'}`;
                } else if (status.interface === 'wifi') {
                    message = `Network: WiFi connected ${status.ssid ? `(${status.ssid})` : ''} ${status.internet ? 'with internet' : 'no internet'}`;
                }
            } else {
                message = 'Network: No connection available';
            }

            if (logger) {
                logger.info(message);
            } else {
                console.log(message);
            }
        } catch (error) {
            if (logger) {
                logger.error(`Network monitoring error: ${error.message}`);
            } else {
                console.error(`Network monitoring error: ${error.message}`);
            }
        }
    }, intervalMinutes * 60 * 1000);

    return monitor;
}

module.exports = {
    initializeNetwork,
    checkEthernetConnection,
    checkEthernetConnectionQuiet,
    checkWifiConnection,
    getNetworkStatus,
    getNetworkStatusQuiet,
    testConnectivityQuiet,
    getWifiSSID,
    displayNetworkStatus,
    getMyIP,
    startNetworkMonitoring,
    startNetworkMonitoringQuiet,
    setNetworkPriority,
    setRoutingPriority,
    ensureInterfacesDetected
};
