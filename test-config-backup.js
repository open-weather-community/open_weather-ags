const { loadConfig, saveConfig, validateConfig, createBackupConfig, restoreFromBackup } = require('./config');
const fs = require('fs');
const path = require('path');

console.log('=== AGS Config Backup System Test ===\n');

// Test 1: Load existing config and create backup
console.log('Test 1: Loading existing config...');
const config = loadConfig();
if (config) {
    console.log('✓ Config loaded successfully');
    console.log('Config ID:', config.myID);
    console.log('Location:', config.locLat, config.locLon);
    console.log('Backup created at:', config.saveDir);
} else {
    console.log('✗ No config found');
}

// Test 2: Test validation
console.log('\nTest 2: Testing config validation...');
if (config) {
    const isValid = validateConfig(config);
    console.log('✓ Config validation:', isValid ? 'PASSED' : 'FAILED');
    
    // Test invalid config
    const invalidConfig = { ...config };
    delete invalidConfig.myID;
    const isInvalid = validateConfig(invalidConfig);
    console.log('✓ Invalid config detection:', !isInvalid ? 'PASSED' : 'FAILED');
}

// Test 3: Test backup file exists
console.log('\nTest 3: Checking backup file...');
if (config && config.saveDir) {
    const backupPath = path.join(config.saveDir, 'ow-config-backup.json');
    if (fs.existsSync(backupPath)) {
        console.log('✓ Backup file exists at:', backupPath);
        
        // Read backup file
        const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
        console.log('✓ Backup timestamp:', backupData._backup_created);
        console.log('✓ Backup source:', backupData._backup_source);
    } else {
        console.log('✗ Backup file not found');
    }
}

// Test 4: Simulate config disappearance and recovery
console.log('\nTest 4: Simulating config recovery...');
if (config && config.saveDir) {
    const configPath = path.join(config.saveDir, 'ow-config.json');
    const backupPath = path.join(config.saveDir, 'ow-config-backup.json');
    
    if (fs.existsSync(configPath) && fs.existsSync(backupPath)) {
        // Temporarily rename the original config
        const tempPath = configPath + '.test-backup';
        fs.renameSync(configPath, tempPath);
        
        console.log('✓ Temporarily moved original config');
        
        // Try to restore from backup
        const restoredConfig = restoreFromBackup(config.saveDir);
        if (restoredConfig) {
            console.log('✓ Config restored from backup successfully');
            console.log('✓ Restored config ID:', restoredConfig.myID);
            
            // Verify the restored file exists
            if (fs.existsSync(configPath)) {
                console.log('✓ Restored config file exists');
                
                // Cleanup: restore original and remove duplicate
                fs.unlinkSync(configPath);
                fs.renameSync(tempPath, configPath);
                console.log('✓ Cleanup completed');
            } else {
                console.log('✗ Restored config file not found');
                // Restore original
                fs.renameSync(tempPath, configPath);
            }
        } else {
            console.log('✗ Failed to restore from backup');
            // Restore original
            fs.renameSync(tempPath, configPath);
        }
    } else {
        console.log('⚠ Skipping recovery test - missing required files');
    }
}

console.log('\n=== Test Complete ==='); 