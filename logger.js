const fs = require("fs");
const path = require("path");
let config = null;
let logFilePath = null;

console.log(`logFilePath: ${logFilePath}`);

class Logger {
  static log(message, level = "INFO") {
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

    // create the logfile if it does not exist
    if (!fs.existsSync(logFilePath))
      fs.writeFileSync(logFilePath, "Log file created\n");

    //const timestamp = new Date().toISOString();
    const logMessage = `${timestamp} - ${level} - ${message}\n`;

    console.log(logMessage);

    // Append log message to the log file
    fs.appendFile(logFilePath, logMessage, (err) => {
      if (err) {
        console.error("Error writing to log file:", err);
      }
    });
  }

  static setConfig(config) {
    this.config = config;
    logFilePath = path.join(config.saveDir, config.logFile);
  }

  static info(message) {
    this.log(message, "INFO");
  }

  static error(message) {
    this.log(message, "ERROR");
  }

  static notice(message) {
    this.log(message, "NOTICE");
  }
}

module.exports = Logger;
