#!/usr/bin/env node
// start-network.js - Standalone network initialization script

const path = require('path');
const { initializeNetwork, startNetworkMonitoring } = require('./network');
const { loadConfig } = require('./config');

async function startNetworkSystem() {
    console.log('=== Open Weather Ground Station Network Startup ===\n');

    try {
        // Load configuration
        console.log('Loading configuration...');
        const config = loadConfig();

        if (!config) {
            console.error('No configuration found. Please ensure ow-config.json exists.');
            process.exit(1);
        }

        console.log('Configuration loaded successfully');

        // Initialize network
        console.log('\nInitializing network connections...');
        const result = await initializeNetwork(config);

        if (result.success) {
            console.log(`\n✅ Network initialization successful!`);
            console.log(`Primary connection: ${result.connection}`);
            console.log(`IP Address: ${result.ip}`);

            // Start monitoring
            console.log('\nStarting network monitoring...');
            const monitor = startNetworkMonitoring(2); // Update every 2 minutes

            console.log('\n🔄 Network monitoring active. Press Ctrl+C to stop.');

            // Handle graceful shutdown
            process.on('SIGINT', () => {
                console.log('\n\nShutting down network monitoring...');
                clearInterval(monitor);
                console.log('Network system stopped.');
                process.exit(0);
            });

            // Keep the process running
            setInterval(() => {
                // Just keep alive
            }, 60000);

        } else {
            console.error(`\n❌ Network initialization failed: ${result.error}`);
            console.log('\nTroubleshooting tips:');
            console.log('1. Check ethernet cable connection');
            console.log('2. Verify WiFi credentials in config file');
            console.log('3. Check network interface status with: ip link show');
            process.exit(1);
        }

    } catch (error) {
        console.error(`\nFatal error: ${error.message}`);
        process.exit(1);
    }
}

// Handle command line arguments
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
    console.log('Open Weather Ground Station Network Startup');
    console.log('');
    console.log('Usage: node start-network.js [options]');
    console.log('');
    console.log('This script initializes network connections with ethernet priority');
    console.log('and displays the connection status on the LCD screen.');
    console.log('');
    console.log('Options:');
    console.log('  --help, -h    Show this help message');
    console.log('');
    console.log('The script will:');
    console.log('1. Check for ethernet connection first (highest priority)');
    console.log('2. Fall back to WiFi if ethernet is not available');
    console.log('3. Display connection status on LCD');
    console.log('4. Monitor network status continuously');
    process.exit(0);
}

// Start the network system
startNetworkSystem();
