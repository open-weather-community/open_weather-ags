// logger.js
const fs = require("fs");
const path = require("path");

class Logger {
  constructor(config) {
    // console.log("config: " + config);
    this.config = config;
    this.logFilePath = path.join(config.saveDir, config.logFile);

    // create the logfile if it does not exist
    if (!fs.existsSync(this.logFilePath)) {
      fs.writeFileSync(this.logFilePath, "Log file created\n");
    }

    this.info("\n========================================\n");
    this.info(`Logger initialized to file: ${this.logFilePath}`);
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
