/**
 * Utility functions for Open-Weather AGS
 * Common helper functions used across multiple modules
 */

const fs = require('fs');
const path = require('path');

/**
 * Formats a timestamp for use in filenames (ISO format with safe characters)
 * @param {Date|string} timestamp - Timestamp to format
 * @returns {string} - Formatted timestamp string safe for filenames
 */
function formatTimestampForFilename(timestamp) {
    return new Date(timestamp).toISOString().replace(/:/g, '-').replace(/\./g, '-');
}

/**
 * Ensures a directory exists, creating it recursively if needed
 * @param {string} directory - Directory path to ensure exists
 */
function ensureDirectoryExists(directory) {
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
}

/**
 * Safely executes a function with timeout
 * @param {Function} fn - Function to execute
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} description - Description for error messages
 * @returns {Promise} - Promise that resolves with function result or rejects on timeout
 */
function withTimeout(fn, timeoutMs, description = 'operation') {
    return Promise.race([
        fn(),
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${description} timed out after ${timeoutMs}ms`)), timeoutMs);
        })
    ]);
}

/**
 * Checks if an error is network-related
 * @param {Error} error - Error object to check
 * @returns {boolean} - True if error is network-related
 */
function isNetworkError(error) {
    const networkErrorCodes = ['EAI_AGAIN', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT', 'ECONNRESET'];
    const networkErrorMessages = ['dns', 'network', 'timeout', 'connection'];

    if (networkErrorCodes.includes(error.code)) {
        return true;
    }

    const errorMessage = error.message.toLowerCase();
    return networkErrorMessages.some(msg => errorMessage.includes(msg));
}

/**
 * Validates that a value is within a numeric range
 * @param {number} value - Value to validate
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {string} fieldName - Field name for error messages
 * @returns {boolean} - True if valid
 * @throws {Error} - If value is outside range
 */
function validateRange(value, min, max, fieldName) {
    if (typeof value !== 'number' || isNaN(value)) {
        throw new Error(`${fieldName} must be a valid number`);
    }
    if (value < min || value > max) {
        throw new Error(`${fieldName} must be between ${min} and ${max}, got ${value}`);
    }
    return true;
}

/**
 * Validates latitude coordinate
 * @param {number} lat - Latitude to validate
 * @returns {boolean} - True if valid
 * @throws {Error} - If latitude is invalid
 */
function validateLatitude(lat) {
    return validateRange(lat, -90, 90, 'Latitude');
}

/**
 * Validates longitude coordinate  
 * @param {number} lon - Longitude to validate
 * @returns {boolean} - True if valid
 * @throws {Error} - If longitude is invalid
 */
function validateLongitude(lon) {
    return validateRange(lon, -180, 180, 'Longitude');
}

/**
 * Formats file size in human readable format
 * @param {number} bytes - Size in bytes
 * @returns {string} - Formatted size string
 */
function formatFileSize(bytes) {
    const units = ['B', 'KB', 'MB', 'GB'];
    let size = bytes;
    let unitIndex = 0;

    while (size >= 1024 && unitIndex < units.length - 1) {
        size /= 1024;
        unitIndex++;
    }

    return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Truncates text to fit within specified length, adding ellipsis if needed
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} - Truncated text
 */
function truncateText(text, maxLength) {
    if (text.length <= maxLength) {
        return text;
    }
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Converts local date to ISO string with timezone offset
 * @param {Date} date - Date to convert
 * @returns {string} - ISO string with timezone
 */
function toLocalISOString(date) {
    const pad = (num) => String(num).padStart(2, '0');
    const year = date.getFullYear();
    const month = pad(date.getMonth() + 1);
    const day = pad(date.getDate());
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    const milliseconds = String(date.getMilliseconds()).padStart(3, '0');
    const timezoneOffset = -date.getTimezoneOffset();
    const offsetSign = timezoneOffset >= 0 ? '+' : '-';
    const offsetHours = pad(Math.floor(Math.abs(timezoneOffset) / 60));
    const offsetMinutes = pad(Math.abs(timezoneOffset) % 60);

    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}.${milliseconds}${offsetSign}${offsetHours}:${offsetMinutes}`;
}

module.exports = {
    formatTimestampForFilename,
    ensureDirectoryExists,
    withTimeout,
    isNetworkError,
    validateRange,
    validateLatitude,
    validateLongitude,
    formatFileSize,
    truncateText,
    toLocalISOString
};
