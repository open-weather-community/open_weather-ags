#!/usr/bin/env node
// test-network-logging.js - Quick test of updated network logging

const { displayNetworkStatus, getNetworkStatus } = require('./network');
const Logger = require('./logger');

// Mock config for logger
const mockConfig = {
    saveDir: '/tmp',
    logFile: 'test-network.log'
};

async function testNetworkLogging() {
    console.log('Testing network logging with timestamps...\n');

    // Test without logger (old behavior)
    console.log('=== Without Logger (old behavior) ===');
    try {
        await displayNetworkStatus();
    } catch (error) {
        console.log('Error:', error.message);
    }

    console.log('\n=== With Logger (new behavior with timestamps) ===');
    // Test with logger (new behavior) 
    const logger = new Logger(mockConfig);
    try {
        await displayNetworkStatus(logger);
    } catch (error) {
        logger.error(`Error: ${error.message}`);
    }

    console.log('\nTest completed. Check log output above for timestamps.');
}

testNetworkLogging().catch(console.error);
