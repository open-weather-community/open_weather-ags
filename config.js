// config.js
const fs = require('fs');
const path = require('path');

const configName = 'ow-config.json';
const configPathFile = 'configPath.json';

// Function to recursively find the config file in a directory and its subdirectories
function findConfigFile(dir) {
    if (!fs.existsSync(dir)) {
        console.log(`Directory not found while finding config: ${dir}`);
        return null;
    }

    let files;
    try {
        files = fs.readdirSync(dir);
    } catch (err) {
        console.log(`Permission denied accessing directory: ${dir}`);
        return null;
    }

    for (const file of files) {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            const result = findConfigFile(fullPath);
            if (result) return result;
        } else if (file === configName) {
            return fullPath;
        }
    }
    return null;
}

// Function to load the configuration
function loadConfig() {
    const configPath = findConfigFile(__dirname);
    if (!configPath) {
        console.log('Config file not found');
        return null;
    }

    try {
        const configData = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(configData);
    } catch (err) {
        console.log(`Error reading config file: ${err}`);
        return null;
    }
}

// Function to save the configuration
function saveConfig(config) {
    const configPath = findConfigFile(__dirname);
    if (!configPath) {
        console.log('Config file not found');
        return false;
    }

    try {
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        return true;
    } catch (err) {
        console.log(`Error writing config file: ${err}`);
        return false;
    }
}

function getConfigPath() {
    if (fs.existsSync(configPathFile)) {
        const data = fs.readFileSync(configPathFile, 'utf8');
        return JSON.parse(data).path;
    }
    return null;
}

module.exports = {
    findConfigFile,
    loadConfig,
    saveConfig,
    getConfigPath
};