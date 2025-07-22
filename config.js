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

// Function to safely read and parse JSON files with corruption detection
function safeReadJSONFile(filePath) {
    try {
        if (!fs.existsSync(filePath)) {
            throw new Error(`File does not exist: ${filePath}`);
        }

        const rawData = fs.readFileSync(filePath, 'utf8');

        // Check for null bytes (common corruption indicator)
        if (rawData.includes('\0')) {
            throw new Error(`File contains null bytes (corrupted): ${filePath}`);
        }

        // Check for minimal file size (empty files are usually corrupted)
        if (rawData.trim().length < 2) {
            throw new Error(`File is empty or too small: ${filePath}`);
        }

        // Check if it starts and ends with expected JSON characters
        const trimmed = rawData.trim();
        if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
            throw new Error(`File does not appear to be valid JSON: ${filePath}`);
        }

        // Parse JSON
        const parsed = JSON.parse(rawData);

        console.log(`Successfully parsed JSON file: ${filePath}`);
        return { success: true, data: parsed, rawData: rawData };

    } catch (err) {
        console.log(`Error reading JSON file ${filePath}: ${err.message}`);
        return { success: false, error: err.message };
    }
}

// Function to attempt corruption recovery
function attemptCorruptionRecovery(configPath) {
    console.log(`Attempting corruption recovery for: ${configPath}`);

    const configDir = path.dirname(configPath);
    const backupPath = path.join(configDir, backupConfigName);

    // Try backup file first
    if (fs.existsSync(backupPath)) {
        console.log(`Trying backup file: ${backupPath}`);
        const backupResult = safeReadJSONFile(backupPath);
        if (backupResult.success) {
            console.log('Backup file is valid, restoring...');
            try {
                // Backup the corrupted file for analysis
                const corruptedBackup = configPath + '.corrupted.' + Date.now();
                fs.copyFileSync(configPath, corruptedBackup);
                console.log(`Corrupted file backed up to: ${corruptedBackup}`);

                // Restore from backup
                fs.copyFileSync(backupPath, configPath);
                console.log('Config file restored from backup');
                return backupResult.data;
            } catch (restoreErr) {
                console.log(`Failed to restore from backup: ${restoreErr.message}`);
            }
        }
    }

    return null;
}

// Function to perform atomic file write (safer against power loss)
function atomicWriteFile(filePath, data) {
    const tempPath = filePath + '.tmp';
    const backupPath = filePath + '.backup';

    try {
        // Create backup of existing file
        if (fs.existsSync(filePath)) {
            fs.copyFileSync(filePath, backupPath);
        }

        // Write to temporary file first
        fs.writeFileSync(tempPath, data, 'utf8');

        // Atomically rename temp file to target (this is atomic on most filesystems)
        fs.renameSync(tempPath, filePath);

        // Clean up backup if write succeeded
        if (fs.existsSync(backupPath)) {
            fs.unlinkSync(backupPath);
        }

        return true;
    } catch (err) {
        console.log(`Atomic write failed: ${err}`);

        // Restore from backup if available
        if (fs.existsSync(backupPath)) {
            try {
                fs.copyFileSync(backupPath, filePath);
                fs.unlinkSync(backupPath);
                console.log('Restored file from backup after failed write');
            } catch (restoreErr) {
                console.log(`Failed to restore backup: ${restoreErr}`);
            }
        }

        // Clean up temp file
        if (fs.existsSync(tempPath)) {
            try {
                fs.unlinkSync(tempPath);
            } catch (cleanupErr) {
                // Ignore cleanup errors
            }
        }

        return false;
    }
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

        const success = atomicWriteFile(backupPath, JSON.stringify(backupConfig, null, 2));
        if (success) {
            console.log(`Backup config created at: ${backupPath}`);
            return backupPath;
        } else {
            console.log('Failed to create backup config');
            return null;
        }
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

        // Restore the primary config using atomic write
        const success = atomicWriteFile(configPath, JSON.stringify(backupConfig, null, 2));
        if (success) {
            console.log(`Config restored from backup: ${configPath}`);
            return backupConfig;
        } else {
            console.log('Failed to restore config from backup');
            return null;
        }
    } catch (err) {
        console.log(`Error restoring from backup: ${err}`);
        return null;
    }
}

// Function to check if config needs updating (avoid unnecessary writes)
function configNeedsUpdate(existingConfig, newConfig) {
    // Compare key fields to see if update is needed
    const keyFields = ['myID', 'locLat', 'locLon', 'gain', 'noaaFrequencies', 'saveDir'];

    for (const field of keyFields) {
        if (JSON.stringify(existingConfig[field]) !== JSON.stringify(newConfig[field])) {
            return true;
        }
    }

    return false;
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
        console.log(`Permission denied accessing directory: ${dir} - Error: ${err.message}`);
        return null;
    }

    // Check for config file in current directory first
    const configPath = path.join(dir, configName);
    if (fs.existsSync(configPath)) {
        console.log(`Found config file: ${configPath}`);
        return configPath;
    }

    // Then search subdirectories
    for (const file of files) {
        const fullPath = path.join(dir, file);

        try {
            const stats = fs.statSync(fullPath);
            // Skip hidden directories like .Trashes or .Trash-* and other files/folders starting with '.'
            if (stats.isDirectory()) {
                const baseName = path.basename(fullPath);
                if (baseName.startsWith('.')) {
                    continue; // Skip hidden folders
                }
                console.log(`Searching subdirectory: ${fullPath}`);
                const result = findConfigFile(fullPath);
                if (result) return result;
            }
        } catch (err) {
            console.log(`Cannot access ${fullPath}: ${err.message}`);
            continue;
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

    // Add specific known USB mount paths first
    const knownUsbPaths = ['/media/openweather/O-W', '/media/openweather'];

    // First, try known USB paths directly (to handle permission issues)
    for (const usbPath of knownUsbPaths) {
        if (fs.existsSync(usbPath)) {
            const configPath = path.join(usbPath, configName);
            if (fs.existsSync(configPath)) {
                try {
                    console.log(`Trying direct USB path: ${configPath}`);
                    const readResult = safeReadJSONFile(configPath);

                    let configJson;
                    if (!readResult.success) {
                        // Attempt corruption recovery
                        console.log(`Config file appears corrupted: ${readResult.error}`);
                        configJson = attemptCorruptionRecovery(configPath);
                        if (!configJson) {
                            console.log(`Failed to recover corrupted config at: ${configPath}`);
                            continue;
                        }
                    } else {
                        configJson = readResult.data;
                    }

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
                    configJson.saveDir = configDir; console.log(`Config file found at: ${configPath}`);

                    // Create/update backup config
                    createBackupConfig(configPath, configJson);

                    // Ensure this is NOT marked as using default since we found real config
                    configJson._using_default = false;

                    return configJson;
                } catch (err) {
                    console.log(`Error reading USB config file: ${err}`);
                    continue;
                }
            }
        }
    }

    // Then try to find the primary config in general search directories
    for (const dir of searchDirs) {
        const configPath = findConfigFile(dir);
        if (configPath) {
            try {
                const readResult = safeReadJSONFile(configPath);

                let configJson;
                if (!readResult.success) {
                    // Attempt corruption recovery
                    console.log(`Config file appears corrupted: ${readResult.error}`);
                    configJson = attemptCorruptionRecovery(configPath);
                    if (!configJson) {
                        console.log(`Failed to recover corrupted config at: ${configPath}`);
                        continue;
                    }
                } else {
                    configJson = readResult.data;
                }

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

                // Only rewrite config if it needs updating (avoid unnecessary writes)
                const originalConfig = { ...configJson };
                delete originalConfig.saveDir; // saveDir is added dynamically, don't compare

                // Ensure this is NOT marked as using default since we found real config
                configJson._using_default = false;

                let needsUpdate = false;
                try {
                    const currentFileData = fs.readFileSync(configPath, 'utf8');
                    const currentConfig = JSON.parse(currentFileData);
                    needsUpdate = configNeedsUpdate(currentConfig, originalConfig);
                } catch (err) {
                    needsUpdate = true; // If we can't read it, assume it needs updating
                }

                if (needsUpdate) {
                    console.log('Config file needs updating, writing changes...');
                    const success = atomicWriteFile(configPath, JSON.stringify(originalConfig, null, 2));
                    if (!success) {
                        console.log('Warning: Failed to update config file, continuing with loaded config');
                    }
                } else {
                    console.log('Config file is current, skipping unnecessary rewrite');
                }

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

            // Ensure this is NOT marked as using default since we restored from backup
            restoredConfig._using_default = false;

            // Save the restored config path
            const restoredConfigPath = path.join(configDir, configName);
            fs.writeFileSync(configPathFile, JSON.stringify({ path: restoredConfigPath }, null, 2), 'utf8');

            return restoredConfig;
        }
    }

    // Last resort: try to load default config as fallback (with warnings)
    console.log('Config file not found and no backup available, checking for default config...');
    const defaultConfigPath = path.join(__dirname, 'default.config.json');
    if (fs.existsSync(defaultConfigPath)) {
        try {
            console.log('WARNING: Using default configuration - WiFi and other settings may not work!');
            const defaultConfigData = fs.readFileSync(defaultConfigPath, 'utf8');
            const defaultConfig = JSON.parse(defaultConfigData);

            // Mark as using default config
            defaultConfig._using_default = true;
            defaultConfig.saveDir = '/tmp'; // Fallback save directory

            console.log('WARNING: Please create ow-config.json with your actual settings!');
            return defaultConfig;
        } catch (err) {
            console.log(`Error reading default config: ${err}`);
        }
    }

    console.log('Config file not found, no backup available, and no default config found');
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

        // Use atomic write for safety
        const success = atomicWriteFile(configPath, JSON.stringify(config, null, 2));
        if (!success) {
            console.log('Failed to save config file');
            return false;
        }

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
    restoreFromBackup,
    atomicWriteFile
};
