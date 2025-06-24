// logger.js
// This module logs messages to a file and the console

const fs = require("fs");
const path = require("path");

class Logger {
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

  info(message) {
    this.log(message, "INFO");
  }

  error(message) {
    this.log(message, "ERROR");
  }

  notice(message) {
    this.log(message, "NOTICE");
  }
}

module.exports = Logger;
