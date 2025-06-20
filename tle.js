// tle.js
// This module processes TLE data to find satellite passes over a specific location
// It uses the satellite.js library to propagate satellite orbits and calculate passes
// The passes are saved to a JSON file for use by the scheduler

const axios = require('axios');
const satellite = require('satellite.js');
const geolib = require('geolib');
const { DateTime } = require('luxon');
const fs = require('fs');
const path = require('path'); // Add this line to import the path module

// Fetch TLE (Two-Line Element) data from Celestrak
async function fetchTLEData() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle';
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        logger.error('Error fetching TLE data: ' + error.message);
        throw error;
    }
}

// Read existing passes from the specified file
function readExistingPasses(config, logger) {
    if (!config.saveDir || !config.passesFile) {
        logger.error('Save directory or passes file is not specified in the config.');
        return [];
    }

    const passesFilePath = path.join(config.saveDir, config.passesFile);

    console.log('Reading existing passes from: ' + passesFilePath);

    if (fs.existsSync(passesFilePath)) {
        const data = fs.readFileSync(passesFilePath, 'utf8');
        if (data.trim() === '') {
            return [];
        }
        try {
            return JSON.parse(data);
        } catch (error) {
            logger.error('Error parsing existing passes JSON: ' + error.message);
            return [];
        }
    } else {
        logger.error(`Passes file not found: ${passesFilePath}, creating a new one.`);
    }
    return [];
}

// Save passes to the specified file, sorted by date and time
function savePasses(passes) {
    passes.sort((a, b) => {
        const dateTimeA = DateTime.fromFormat(`${a.date} ${a.time}`, 'dd LLL yyyy HH:mm');
        const dateTimeB = DateTime.fromFormat(`${b.date} ${b.time}`, 'dd LLL yyyy HH:mm');
        return dateTimeA - dateTimeB;
    });
    fs.writeFileSync(path.join(config.saveDir, config.passesFile), JSON.stringify(passes, null, 2));
}

// Find satellite passes over a specific location
async function findSatellitePasses(tleLine1, tleLine2) {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2); // Convert TLE lines to satellite record
    const startTime = DateTime.utc();
    const endTime = startTime.plus({ days: config.daysToPropagate });
    const timeStep = { minutes: 1 }; // Propagate in 1-minute steps
    let currentTime = startTime;
    let passStart = null;
    const passes = [];
    let elevations = [];
    let distances = [];
    
    // Get minimum elevation from config, default to 0 if not specified
    const minElevation = config.minElevation || 0;

    // Loop through each minute in the propagation period
    while (currentTime < endTime) {
        const positionAndVelocity = satellite.propagate(satrec, currentTime.toJSDate());
        const positionEci = positionAndVelocity.position;

        if (positionEci) {
            const gmst = satellite.gstime(currentTime.toJSDate());
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            const satLat = satellite.degreesLat(positionGd.latitude);
            const satLon = satellite.degreesLong(positionGd.longitude);
            const distance = geolib.getDistance(
                { latitude: satLat, longitude: satLon },
                { latitude: config.locLat, longitude: config.locLon }
            );

            // Check if the satellite is within the maximum distance
            if (distance <= config.maxDistance) {
                const observerGd = {
                    longitude: satellite.degreesToRadians(config.locLon),
                    latitude: satellite.degreesToRadians(config.locLat),
                    height: 0
                };
                const positionEcf = satellite.eciToEcf(positionEci, gmst);
                const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
                const elevation = satellite.radiansToDegrees(lookAngles.elevation);

                // Only process points that meet minimum elevation requirement
                if (elevation >= minElevation) {
                    if (!passStart) {
                        passStart = currentTime; // Mark the start of the pass
                        elevations = [];
                        distances = [];
                    }

                    elevations.push(elevation);
                    distances.push(distance);
                } else if (passStart) {
                    // End of pass - satellite dropped below minimum elevation
                    const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
                    const maxElevation = Math.max(...elevations);
                    const avgDistance = distances.reduce((sum, el) => sum + el, 0) / distances.length;
                    const minDistance = Math.min(...distances);

                    // Only add passes that meet the minimum elevation requirement
                    if (maxElevation >= minElevation) {
                        passes.push({
                            start: passStart,
                            end: currentTime,
                            maxElevation: maxElevation.toFixed(2),
                            avgElevation: avgElevation.toFixed(2),
                            avgDistance: avgDistance.toFixed(2),
                            minDistance: minDistance.toFixed(2)
                        });
                    }
                    passStart = null; // Reset pass start
                }
            } else if (passStart) {
                // End of pass - satellite moved too far away
                const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
                const maxElevation = Math.max(...elevations);
                const avgDistance = distances.reduce((sum, el) => sum + el, 0) / distances.length;
                const minDistance = Math.min(...distances);

                // Only add passes that meet the minimum elevation requirement
                if (maxElevation >= minElevation) {
                    passes.push({
                        start: passStart,
                        end: currentTime,
                        maxElevation: maxElevation.toFixed(2),
                        avgElevation: avgElevation.toFixed(2),
                        avgDistance: avgDistance.toFixed(2),
                        minDistance: minDistance.toFixed(2)
                    });
                }
                passStart = null; // Reset pass start
            }
        }

        currentTime = currentTime.plus(timeStep); // Move to the next minute
    }

    // Handle case where the pass doesn't end before endTime
    if (passStart) {
        const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
        const maxElevation = Math.max(...elevations);
        
        // Only add passes that meet the minimum elevation requirement
        if (maxElevation >= minElevation) {
            passes.push({
                start: passStart,
                end: currentTime,
                maxElevation: maxElevation.toFixed(2),
                avgElevation: avgElevation.toFixed(2)
            });
        }
    }

    return passes;
}

// Process passes and save them to a file
async function processPasses(configParam, loggerParam) {
    config = configParam;
    logger = loggerParam;

    try {
        logger.info('Starting TLE data processing...');

        // Fetch TLE data
        const tleData = await fetchTLEData();
        const tleLines = tleData.split('\n').filter(line => line.trim() !== '');
        logger.info(`Found TLE data for ${tleLines.length / 3} satellites.`);

        const existingPasses = readExistingPasses(config, logger);

        // Process each satellite specified in the config
        for (const satName in config.noaaFrequencies) {
            let tleLine1, tleLine2;
            for (let i = 0; i < tleLines.length; i++) {
                if (tleLines[i].startsWith(satName)) {
                    tleLine1 = tleLines[i + 1];
                    tleLine2 = tleLines[i + 2];
                    break;
                }
            }

            if (!tleLine1 || !tleLine2) {
                logger.error(`TLE data for ${satName} not found.`);
                continue;
            }

            logger.info(`Processing satellite: ${satName}`);
            const passes = await findSatellitePasses(tleLine1, tleLine2);
            
            logger.info(`Found ${passes.length} passes for ${satName} above ${config.minElevation || 0}° elevation`);

            // Format and add new passes
            passes.forEach(pass => {
                const formattedStart = DateTime.fromISO(pass.start.toISO());
                const formattedEnd = DateTime.fromISO(pass.end.toISO());
                const maxElevation = pass.maxElevation || 'N/A';
                const avgElevation = pass.avgElevation || 'N/A';
                const avgDistance = pass.avgDistance || 'N/A';
                const minDistance = pass.minDistance || 'N/A';

                let bufferStart = formattedStart.minus({ minutes: config.bufferMinutes });
                let bufferEnd = formattedEnd.plus({ minutes: config.bufferMinutes });
                let bufferDuration = Math.round((bufferEnd - bufferStart) / (1000 * 60));

                // Ensure the bufferDuration is at least 2 minutes
                if (bufferDuration < 2) {
                    bufferDuration = 2;
                    bufferEnd = bufferStart.plus({ minutes: 2 });
                }

                const newPass = {
                    frequency: config.noaaFrequencies[satName],
                    satellite: satName,
                    date: bufferStart.toFormat('dd LLL yyyy'),
                    time: bufferStart.toFormat('HH:mm'),
                    duration: bufferDuration,
                    avgElevation: avgElevation,
                    maxElevation: maxElevation,
                    avgDistance: avgDistance,
                    minDistance: minDistance,
                    recorded: false
                };

                // Avoid adding duplicate passes
                const duplicate = existingPasses.some(
                    existingPass =>
                        existingPass.satellite === newPass.satellite &&
                        existingPass.date === newPass.date &&
                        existingPass.time === newPass.time
                );

                if (!duplicate) {
                    existingPasses.push(newPass);
                    logger.info(`Added pass: ${satName} on ${newPass.date} at ${newPass.time}, max elevation: ${maxElevation}°`);
                }
            });
        }

        // Save updated passes
        savePasses(existingPasses);
        logger.info('Satellite passes have been updated and saved.');
    } catch (err) {
        logger.error('Error processing TLE data: ' + err.message);
        throw err;
    }
}

// Entry point for running the script directly
if (require.main === module) {

    // Load configuration from the config file
    const { loadConfig } = require('./config'); // Import config module
    const config = loadConfig();

    const Logger = require('./logger');
    const logger = new Logger(config);

    processPasses(config, logger).catch(console.error);
} else {
    // Export processPasses function for external use
    module.exports = {
        processPasses
    };
}
