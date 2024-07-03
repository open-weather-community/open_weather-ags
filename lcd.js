const LCD = require('raspberrypi-liquid-crystal');

const lcd = new LCD(1, 0x27, 16, 2); // Adjust the parameters according to your LCD setup
lcd.beginSync();

// Function to clear the LCD screen
function clearLCD() {
    lcd.clearSync();
}

// Function to print a message on the LCD screen
function printLCD(line1, line2 = '') {
    lcd.clearSync();
    lcd.printSync(line1);
    lcd.setCursorSync(0, 1);
    lcd.printSync(line2);
}

// Function to start the marquee effect
function startMarquee(text, intervalTime = 500) {
    const maxStart = text.length - 16; // Assuming 16 is the LCD display width

    let currentPosition = 0;

    const interval = setInterval(() => {
        lcd.clearSync();

        const displayText = text.substring(currentPosition, currentPosition + 16);

        lcd.printSync(displayText);

        currentPosition++;
        if (currentPosition > maxStart) {
            currentPosition = 0;
        }
    }, intervalTime);

    // Return the interval object so it can be cleared later if needed
    return interval;
}

// Example usage of the marquee effect
// Uncomment to test the marquee effect
/*
printLCD('Booting up...');
const marqueeInterval = startMarquee('Hello, World! This is a marquee effect.', 500);

// Stop the marquee after 10 seconds for demonstration purposes
setTimeout(() => {
    clearInterval(marqueeInterval);
    clearLCD();
    printLCD('Marquee stopped.');
}, 10000);
*/

// Export the functions to be used in other modules
module.exports = {
    clearLCD,
    printLCD,
    startMarquee
};
