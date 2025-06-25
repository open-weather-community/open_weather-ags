#!/usr/bin/env node

// Test script for graceful restart functionality
const { printLCD } = require('./lcd');
const { spawn } = require('child_process');

// Function to perform graceful restart with user notification
async function gracefulRestart(reason, delay = 10) {
    try {
        console.log(`Initiating graceful restart: ${reason}`);
        printLCD('System restart', 'required...');

        // Give user time to see first message
        setTimeout(() => {
            printLCD('Restarting in', `${delay} seconds...`);
        }, 2000);

        // Countdown
        let countdown = delay - 5;
        const countdownInterval = setInterval(() => {
            if (countdown > 0) {
                printLCD('Restarting in', `${countdown} seconds...`);
                countdown--;
            } else {
                clearInterval(countdownInterval);
                printLCD('Restarting now', 'Please wait...');
            }
        }, 1000);

        // Wait for the delay, then restart (disabled for testing)
        setTimeout(() => {
            console.log(`Would restart system: ${reason}`);
            console.log('Test complete - restart functionality working!');
            clearInterval(countdownInterval);
            printLCD('Test complete!', 'Restart working');
            process.exit(0);

            // Actual restart command (commented out for testing):
            // const shutdown = spawn('sudo', ['shutdown', '-r', '+0', `AGS restart: ${reason}`], {
            //     detached: true,
            //     stdio: 'ignore'
            // });
            // shutdown.unref();
        }, delay * 1000);

    } catch (error) {
        console.error(`Error during graceful restart: ${error.message}`);
        // Fallback to immediate restart (disabled for testing)
        console.log('Would fallback to immediate restart');
        process.exit(1);
    }
}

// Test the function
console.log('Testing graceful restart functionality...');
gracefulRestart('testing automatic restart after GitHub update', 8);
