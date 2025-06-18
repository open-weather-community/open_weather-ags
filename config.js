const fs = require('fs');
const path = require('path');

const configName = 'ow-config.json';
const backupConfigName = 'ow-config-backup.json';
const configPathFile = 'configPath.json';

// Function to validate config structure
function validateConfig(config) {
    const requiredFields = ['myID', 'locLat', 'locLon', 'gain', 'noaaFrequencies'];
    for (const field of requiredFields) {
        if (config[field] === undefined || config[field] === null) {
            console.log(`Missing required config field: ${field}`);
            return false;
        }
    }
    return true;
}

// Function to create a backup of the config file
function createBackupConfig(configPath, config) {
    try {
        const configDir = path.dirname(configPath);
        const backupPath = path.join(configDir, backupConfigName);
        
        // Add timestamp to backup for debugging
        const backupConfig = {
            ...config,
            _backup_created: new Date().toISOString(),
            _backup_source: configPath
        };
        
        fs.writeFileSync(backupPath, JSON.stringify(backupConfig, null, 2), 'utf8');
        console.log(`Backup config created at: ${backupPath}`);
        return backupPath;
    } catch (err) {
        console.log(`Error creating backup config: ${err}`);
        return null;
    }
}

// Function to restore config from backup
function restoreFromBackup(configDir) {
    try {
        const backupPath = path.join(configDir, backupConfigName);
        const configPath = path.join(configDir, configName);
        
        if (!fs.existsSync(backupPath)) {
            console.log('No backup config found to restore from');
            return null;
        }
        
        const backupData = fs.readFileSync(backupPath, 'utf8');
        const backupConfig = JSON.parse(backupData);
        
        // Validate backup config
        if (!validateConfig(backupConfig)) {
            console.log('Backup config is invalid, cannot restore');
            return null;
        }
        
        // Remove backup metadata before restoring
        delete backupConfig._backup_created;
        delete backupConfig._backup_source;
        
        // Restore the primary config
        fs.writeFileSync(configPath, JSON.stringify(backupConfig, null, 2), 'utf8');
        console.log(`Config restored from backup: ${configPath}`);
        
        return backupConfig;
    } catch (err) {
        console.log(`Error restoring from backup: ${err}`);
        return null;
    }
}

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

// Function to find any existing config directory (for recovery purposes)
function findConfigDirectory() {
    const searchDirs = ['/media', '/mnt'];
    for (const dir of searchDirs) {
        if (!fs.existsSync(dir)) continue;
        
        try {
            const subdirs = fs.readdirSync(dir);
            for (const subdir of subdirs) {
                const fullPath = path.join(dir, subdir);
                if (fs.statSync(fullPath).isDirectory()) {
                    // Check if this directory has a backup config
                    const backupPath = path.join(fullPath, backupConfigName);
                    if (fs.existsSync(backupPath)) {
                        return fullPath;
                    }
                }
            }
        } catch (err) {
            continue;
        }
    }
    return null;
}

// Function to load the configuration with backup recovery
function loadConfig() {
    const searchDirs = ['/media', '/mnt'];
    
    // First, try to find the primary config
    for (const dir of searchDirs) {
        const configPath = findConfigFile(dir);
        if (configPath) {
            try {
                const configData = fs.readFileSync(configPath, 'utf8');
                const configJson = JSON.parse(configData);
                
                // Validate the config
                if (!validateConfig(configJson)) {
                    console.log(`Config validation failed for: ${configPath}`);
                    continue;
                }

                // Save configPath to configPathFile
                fs.writeFileSync(configPathFile, JSON.stringify({ path: configPath }, null, 2), 'utf8');

                // Get the directory of the config file
                const configDir = path.dirname(configPath);
                console.log(`Config directory: ${configDir}`);
                configJson.saveDir = configDir;

                console.log(`Config file found at: ${configPath}`);

                // Create/update backup config
                createBackupConfig(configPath, configJson);

                // Write the updated configData back to the configPath
                fs.writeFileSync(configPath, JSON.stringify(configJson, null, 2), 'utf8');

                return configJson;
            } catch (err) {
                console.log(`Error reading config file: ${err}`);
                
                // Try to restore from backup in the same directory
                const configDir = path.dirname(configPath);
                const restoredConfig = restoreFromBackup(configDir);
                if (restoredConfig) {
                    restoredConfig.saveDir = configDir;
                    return restoredConfig;
                }
                continue;
            }
        }
    }
    
    // If no primary config found, try to find and restore from any backup
    console.log('Primary config not found, searching for backup configs...');
    const configDir = findConfigDirectory();
    if (configDir) {
        const restoredConfig = restoreFromBackup(configDir);
        if (restoredConfig) {
            console.log(`Config restored from backup in directory: ${configDir}`);
            restoredConfig.saveDir = configDir;
            
            // Save the restored config path
            const restoredConfigPath = path.join(configDir, configName);
            fs.writeFileSync(configPathFile, JSON.stringify({ path: restoredConfigPath }, null, 2), 'utf8');
            
            return restoredConfig;
        }
    }
    
    console.log('Config file not found and no backup available');
    return null;
}

// Function to save the configuration (also updates backup)
function saveConfig(config) {
    const configPath = getConfigPath();
    if (!configPath || !fs.existsSync(configPath)) {
        console.log('Config file not found');
        return false;
    }

    try {
        // Validate before saving
        if (!validateConfig(config)) {
            console.log('Config validation failed, not saving');
            return false;
        }
        
        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
        
        // Update backup when saving
        createBackupConfig(configPath, config);
        
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
    getConfigPath,
    validateConfig,
    createBackupConfig,
    restoreFromBackup
};
