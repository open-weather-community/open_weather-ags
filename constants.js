/**
 * Constants and enumerations for Open-Weather AGS
 * Centralized configuration for system-wide constants
 */

// Network configuration
const NETWORK = {
    TLE_URL: 'https://celestrak.org/NOAA/elements/noaa.txt',
    REQUEST_TIMEOUT: 30000, // 30 seconds
    MAX_RETRIES: 3,
    RETRY_DELAY: 5000 // 5 seconds
};

// File system constants
const FILES = {
    CONFIG_NAME: 'ow-config.json',
    BACKUP_CONFIG_NAME: 'ow-config-backup.json',
    CONFIG_PATH_FILE: 'configPath.json',
    TLE_CACHE_FILE: 'tle_cache.txt',
    PASSES_FILE: 'passes.json',
    LOG_FILE: 'log.txt'
};

// Logging configuration
const LOGGING = {
    MAX_LOG_LINES: 1500,
    DELETE_LOG_LINES: 500,
    LOG_LEVELS: {
        ERROR: 'ERROR',
        WARN: 'WARN',
        INFO: 'INFO',
        DEBUG: 'DEBUG',
        NOTICE: 'NOTICE'
    }
};

// Satellite configuration
const SATELLITES = {
    DEFAULT_FREQUENCIES: {
        'NOAA 19': '137.1M',
        'NOAA 15': '137.62M'
    },
    DEFAULT_MIN_ELEVATION: 30,
    DEFAULT_MAX_DISTANCE: 2200000,
    DEFAULT_BUFFER_MINUTES: 0
};

// Hardware configuration
const HARDWARE = {
    LCD_ADDRESS: 0x27,
    LCD_COLS: 16,
    LCD_ROWS: 2,
    I2C_BUS: 1
};

// System timing
const TIMING = {
    REBOOT_HOUR: 3, // 3:00 AM
    REBOOT_BUFFER_MINUTES: 10, // 2:50-3:10 AM buffer
    STARTUP_DELAY: 5000, // 5 seconds
    NETWORK_STABILIZATION_DELAY: 10000 // 10 seconds
};

// USB mount paths
const USB_PATHS = {
    SEARCH_DIRS: ['/media', '/mnt'],
    KNOWN_PATHS: ['/media/openweather/O-W', '/media/openweather'],
    FALLBACK_DIRS: ['/home/openweather/logs', '/tmp']
};

// Network interface patterns
const NETWORK_INTERFACES = {
    ETHERNET: ['eth0', 'enp0s3', 'enp42s0', 'enx*'],
    WIFI: ['wlan0', 'wlp*']
};

// Validation ranges
const VALIDATION = {
    LATITUDE: { min: -90, max: 90 },
    LONGITUDE: { min: -180, max: 180 },
    GAIN: { min: 0, max: 50 },
    STATION_ID: { min: 0, max: 9999 }, // Allow 0 as placeholder/test value
    ELEVATION: { min: 0, max: 90 },
    DISTANCE: { min: 100000, max: 5000000 }
};

// Recording settings
const RECORDING = {
    DEFAULT_SAMPLE_RATE: '48k',
    DOWNSAMPLE_RATE: '11025',
    DEFAULT_GAIN: 38,
    FILE_FORMAT: 'wav'
};

module.exports = {
    NETWORK,
    FILES,
    LOGGING,
    SATELLITES,
    HARDWARE,
    TIMING,
    USB_PATHS,
    NETWORK_INTERFACES,
    VALIDATION,
    RECORDING
};
