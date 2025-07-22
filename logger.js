/**
 * Logger module for Open-Weather AGS
 * Provides centralized logging with file and console output
 * Handles fallback locations for read-only USB drives
 */

const fs = require("fs");
const path = require("path");

/**
 * Logger class for handling application logging
 * Automatically handles log file creation and fallback locations
 * Supports multiple log levels (INFO, ERROR, NOTICE)
 */
class Logger {
  /**
   * Initialize logger with configuration
   * @param {Object} config - Configuration object containing saveDir and logFile
   */
  constructor(config) {
    // console.log("config: " + config);
    this.config = config;
    this.originalLogPath = path.join(config.saveDir, config.logFile);

    // Try to use the configured log path, but fall back to a writable location if the USB is read-only
    this.logFilePath = this.getWritableLogPath(config);

    // create the logfile if it does not exist
    if (!fs.existsSync(this.logFilePath)) {
      try {
        fs.writeFileSync(this.logFilePath, "Log file created\n");
      } catch (err) {
        console.error(`Failed to create log file at ${this.logFilePath}:`, err);
        // Fallback to home directory if all else fails
        this.logFilePath = path.join(process.env.HOME || '/tmp', 'ow-fallback.log');
        fs.writeFileSync(this.logFilePath, "Log file created (fallback location)\n");
      }
    }

    this.info("\n========================================\n");
    this.info(`Logger initialized to file: ${this.logFilePath}`);
    if (this.logFilePath !== this.originalLogPath) {
      this.info(`Note: Using fallback log location due to read-only USB drive`);
      this.info(`Original path was: ${this.originalLogPath}`);
    }
    // print version number from package.json
    const packageJson = require("./package.json");
    this.info(`Version: ${packageJson.version}`);

  }

  /**
   * Get writable log path, falling back to home directory if USB is read-only
   * @param {Object} config - Configuration object
   * @returns {string} - Path to writable log file location
   */
  getWritableLogPath(config) {
    const preferredPath = path.join(config.saveDir, config.logFile);

    // Test if we can write to the preferred location
    try {
      const testFile = preferredPath + '.test';
      fs.writeFileSync(testFile, 'test');
      fs.unlinkSync(testFile);
      return preferredPath; // Success, use the configured path
    } catch (err) {
      console.log(`USB log path ${preferredPath} is not writable (${err.code}), using fallback location`);

      // Fallback to a writable location in the home directory
      const fallbackDir = '/home/openweather/logs';

      // Ensure fallback directory exists
      if (!fs.existsSync(fallbackDir)) {
        fs.mkdirSync(fallbackDir, { recursive: true });
      }

      return path.join(fallbackDir, config.logFile);
    }
  }

  /**
   * Log a message with specified level
   * @param {string} message - Message to log
   * @param {string} level - Log level (INFO, ERROR, NOTICE)
   */
  log(message, level = "INFO") {
    const options = {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      timeZoneName: "short",
    };
    const timestamp = new Date().toLocaleString("en-US", options);

    const logMessage = `${timestamp} - ${level} - ${message}\n`;

    console.log(logMessage);

    // Append log message to the log file
    fs.appendFile(this.logFilePath, logMessage, (err) => {
      if (err) {
        console.error("Error writing to log file:", err);
      }
    });
  }

  /**
   * Log an info message
   * @param {string} message - Message to log
   */
  info(message) {
    this.log(message, "INFO");
  }

  /**
   * Log an error message
   * @param {string} message - Error message to log
   */
  error(message) {
    this.log(message, "ERROR");
  }

  /**
   * Log a notice message
   * @param {string} message - Notice message to log
   */
  notice(message) {
    this.log(message, "NOTICE");
  }
}

module.exports = Logger;
