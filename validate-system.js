#!/usr/bin/env node

/**
 * System validation script for Open-Weather AGS
 * Checks system requirements and configuration
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('='.repeat(50));
console.log('Open-Weather AGS System Validation');
console.log('='.repeat(50));

let hasErrors = false;

/**
 * Check if a command exists in the system
 */
function commandExists(command) {
    try {
        execSync(`which ${command}`, { stdio: 'ignore' });
        return true;
    } catch {
        return false;
    }
}

/**
 * Check if a file exists
 */
function fileExists(filePath) {
    return fs.existsSync(filePath);
}

/**
 * Run a validation check
 */
function check(name, condition, recommendation = '') {
    const status = condition ? '✓' : '✗';
    const result = condition ? 'PASS' : 'FAIL';

    console.log(`${status} ${name}: ${result}`);

    if (!condition) {
        hasErrors = true;
        if (recommendation) {
            console.log(`  → ${recommendation}`);
        }
    }
}

// Node.js version check
console.log('\n📦 Node.js Environment');
console.log('-'.repeat(30));
const nodeVersion = process.version;
const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
check('Node.js version >= 18', majorVersion >= 18, `Current: ${nodeVersion}, Required: >= 18.0.0`);

// Package dependencies
console.log('\n📚 Dependencies');
console.log('-'.repeat(30));
const packageJson = require('./package.json');
const nodeModulesExists = fileExists('./node_modules');
check('node_modules directory exists', nodeModulesExists, 'Run: npm install');

if (nodeModulesExists) {
    const criticalDeps = ['satellite.js', 'axios', 'luxon', 'geolib'];
    criticalDeps.forEach(dep => {
        const depExists = fileExists(`./node_modules/${dep}`);
        check(`${dep} installed`, depExists, `Run: npm install ${dep}`);
    });
}

// System commands
console.log('\n🔧 System Tools');
console.log('-'.repeat(30));
check('rtl_fm available', commandExists('rtl_fm'), 'Install rtl-sdr tools: apt install rtl-sdr');
check('sox available', commandExists('sox'), 'Install SoX: apt install sox');
check('git available', commandExists('git'), 'Install git: apt install git');

// I2C for LCD (Raspberry Pi specific)
console.log('\n🖥️  Hardware Interfaces');
console.log('-'.repeat(30));
const i2cExists = fileExists('/dev/i2c-1');
check('I2C interface available', i2cExists, 'Enable I2C: sudo raspi-config → Interface Options → I2C');

if (commandExists('i2cdetect')) {
    try {
        const i2cOutput = execSync('i2cdetect -y 1 2>/dev/null || echo "no-devices"', { encoding: 'utf8' });
        const hasLCD = i2cOutput.includes('27') || i2cOutput.includes('3f');
        check('LCD detected on I2C', hasLCD, 'Check LCD wiring and I2C address (usually 0x27)');
    } catch {
        check('LCD detection', false, 'Install i2c-tools: apt install i2c-tools');
    }
} else {
    check('i2c-tools available', false, 'Install i2c-tools: apt install i2c-tools');
}

// File structure
console.log('\n📁 File Structure');
console.log('-'.repeat(30));
const coreFiles = [
    'scheduler.js',
    'config.js',
    'tle.js',
    'recorder.js',
    'network.js',
    'lcd.js',
    'logger.js'
];

coreFiles.forEach(file => {
    check(`${file} exists`, fileExists(file), `File missing: ${file}`);
});

// Configuration
console.log('\n⚙️  Configuration');
console.log('-'.repeat(30));
check('default.config.json exists', fileExists('default.config.json'), 'Default config template missing');

// USB mount points
console.log('\n💾 USB Storage');
console.log('-'.repeat(30));
const usbPaths = ['/media', '/mnt'];
usbPaths.forEach(usbPath => {
    check(`${usbPath} directory exists`, fileExists(usbPath), `Create directory: sudo mkdir -p ${usbPath}`);
});

// Network tools
console.log('\n🌐 Network Tools');
console.log('-'.repeat(30));
check('nmcli available', commandExists('nmcli'), 'NetworkManager required for WiFi management');
check('ping available', commandExists('ping'), 'Network connectivity testing tool missing');

// Summary
console.log('\n' + '='.repeat(50));
if (hasErrors) {
    console.log('❌ System validation FAILED');
    console.log('Please address the issues above before running the AGS.');
    process.exit(1);
} else {
    console.log('✅ System validation PASSED');
    console.log('Your system appears ready to run Open-Weather AGS!');
}
console.log('='.repeat(50));
