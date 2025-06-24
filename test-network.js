#!/usr/bin/env node
// test-network.js - Simple test script to verify network functionality

const {
    checkEthernetConnection,
    getNetworkStatus,
    displayNetworkStatus,
    getMyIP
} = require('./network');

async function testNetwork() {
    console.log('=== Network Test ===\n');

    try {
        console.log('1. Testing ethernet connection...');
        const ethernetStatus = await checkEthernetConnection();
        console.log('Ethernet status:', ethernetStatus);
        console.log('');

        console.log('2. Getting full network status...');
        const networkStatus = await getNetworkStatus();
        console.log('Network status:', JSON.stringify(networkStatus, null, 2));
        console.log('');

        console.log('3. Testing IP address detection...');
        const myIP = await getMyIP();
        console.log('Current IP:', myIP);
        console.log('');

        console.log('4. Displaying network status on LCD...');
        await displayNetworkStatus();
        console.log('LCD updated with network status');

    } catch (error) {
        console.error('Test failed:', error.message);
    }
}

// Run the test if this script is executed directly
if (require.main === module) {
    testNetwork().then(() => {
        console.log('\n=== Test Complete ===');
        process.exit(0);
    }).catch(error => {
        console.error('Test error:', error);
        process.exit(1);
    });
}

module.exports = { testNetwork };
