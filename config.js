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

        // Skip hidden directories like .Trashes or .Trash-* and other files/folders starting with '.'
        if (fs.statSync(fullPath).isDirectory()) {
            const baseName = path.basename(fullPath);
            if (baseName.startsWith('.')) {
                continue; // Skip hidden folders
            }
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
    const searchDirs = ['/media', '/mnt'];
    for (const dir of searchDirs) {
        const configPath = findConfigFile(dir);
        if (configPath) {
            try {
                const configData = fs.readFileSync(configPath, 'utf8');
                const configJson = JSON.parse(configData);

                // Save configPath to configPathFile
                fs.writeFileSync(configPathFile, JSON.stringify({ path: configPath }, null, 2), 'utf8');

                // Get the directory of the config file
                const configDir = path.dirname(configPath);
                console.log(`Config directory: ${configDir}`);
                configJson.saveDir = configDir;

                console.log(`Config file found at: ${configPath}`);

                // Write the updated configData back to the configPath
                fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2), 'utf8');

                return configJson;
            } catch (err) {
                console.log(`Error reading config file: ${err}`);
                return null;
            }
        }
    }
    console.log('Config file not found (loadConfig)');
    return null;
}

// Function to save the configuration
function saveConfig(config) {
    const configPath = getConfigPath();
    if (!configPath || !fs.existsSync(configPath)) {
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
