const axios = require('axios');
const satellite = require('satellite.js');
const geolib = require('geolib');
const { DateTime } = require('luxon');
const fs = require('fs');
const Logger = require('./logger');

// Function to load configuration from file
function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
        throw new Error('Config file not found.');
    }
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Function to find satellite passes over a specific location
async function findSatellitePasses(configPath) {
    try {
        // Load configuration
        const config = loadConfig(configPath);
        const maxDistance = config.maxDistance;
        const locLat = config.locLat;
        const locLon = config.locLon;
        const noaaFrequencies = config.noaaFrequencies;
        const passesFile = config.passesFile;
        const daysToPropagate = config.daysToPropagate;
        const bufferMinutes = config.bufferMinutes;

        // Initialize Logger with the configuration
        Logger.setConfig(config);

        // Fetch TLE data
        const tleData = await fetchTLEData();
        const tleLines = tleData.split('\n').filter(line => line.trim() !== '');

        Logger.info(`Found TLE data for ${tleLines.length / 3} satellites.`);

        // Read existing passes from file
        const existingPasses = readExistingPasses(passesFile);

        // Process passes for each satellite
        for (const satName in noaaFrequencies) {
            let tleLine1, tleLine2;
            for (let i = 0; i < tleLines.length; i++) {
                if (tleLines[i].startsWith(satName)) {
                    tleLine1 = tleLines[i + 1];
                    tleLine2 = tleLines[i + 2];
                    break;
                }
            }

            if (!tleLine1 || !tleLine2) {
                Logger.error(`TLE data for ${satName} not found.`);
                continue;
            }

            const passes = await calculateSatellitePasses(
                satName,
                tleLine1,
                tleLine2,
                maxDistance,
                locLat,
                locLon,
                daysToPropagate,
                bufferMinutes
            );

            // Process each pass and update existing passes
            processPasses(passes, existingPasses, noaaFrequencies[satName]);
        }

        // Save updated passes to file
        savePasses(existingPasses, passesFile);
        Logger.info('Satellite passes have been updated and saved.');
    } catch (error) {
        console.error('Error processing passes:', error.message);
        process.exit(1);
    }
}

// Fetch TLE data from Celestrak
async function fetchTLEData() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle';
    const response = await axios.get(url);
    return response.data;
}

// Read existing passes from file
function readExistingPasses(passesFile) {
    try {
        if (fs.existsSync(passesFile)) {
            const data = fs.readFileSync(passesFile, 'utf8');
            if (data.trim() === '') {
                return [];
            }
            return JSON.parse(data);
        }
        return [];
    } catch (error) {
        Logger.error('Error reading existing passes:', error.message);
        return [];
    }
}

// Save passes to file
function savePasses(passes, passesFile) {
    try {
        passes.sort((a, b) => DateTime.fromISO(a.start) - DateTime.fromISO(b.start));
        fs.writeFileSync(passesFile, JSON.stringify(passes, null, 2));
    } catch (error) {
        Logger.error('Error saving passes:', error.message);
    }
}

// Calculate satellite passes over specific location
async function calculateSatellitePasses(
    satName,
    tleLine1,
    tleLine2,
    maxDistance,
    locLat,
    locLon,
    daysToPropagate,
    bufferMinutes
) {
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);
    const startTime = DateTime.utc();
    const endTime = startTime.plus({ days: daysToPropagate });
    const timeStep = { minutes: 1 };

    let currentTime = startTime;
    let passStart = null;
    const passes = [];
    let elevations = [];
    let distances = [];

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
                { latitude: locLat, longitude: locLon }
            );

            if (distance <= maxDistance) {
                const observerGd = {
                    longitude: satellite.degreesToRadians(locLon),
                    latitude: satellite.degreesToRadians(locLat),
                    height: 0
                };
                const positionEcf = satellite.eciToEcf(positionEci, gmst);
                const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
                const elevation = satellite.radiansToDegrees(lookAngles.elevation);

                if (!passStart) {
                    passStart = currentTime;
                    elevations = [];
                }

                elevations.push(elevation);
                distances.push(distance);
            } else {
                if (passStart) {
                    const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
                    const maxElevation = Math.max(...elevations);
                    const avgDistance = distances.reduce((sum, el) => sum + el, 0) / distances.length;
                    const minDistance = Math.min(...distances);

                    passes.push({
                        start: passStart.toISO(),
                        end: currentTime.toISO(),
                        maxElevation: maxElevation.toFixed(2),
                        avgElevation: avgElevation.toFixed(2),
                        avgDistance: avgDistance.toFixed(2),
                        minDistance: minDistance.toFixed(2)
                    });
                    passStart = null;
                }
            }
        }

        currentTime = currentTime.plus(timeStep);
    }

    if (passStart) {
        const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
        const maxElevation = Math.max(...elevations);
        passes.push({
            start: passStart.toISO(),
            end: currentTime.toISO(),
            maxElevation: maxElevation.toFixed(2),
            avgElevation: avgElevation.toFixed(2)
        });
    }

    return passes;
}

// Main function to process passes
async function main() {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: node tle.js <configPath>');
        process.exit(1);
    }
    const configPath = args[0];
    await findSatellitePasses(configPath);
}

if (require.main === module) {
    Logger.info("tle script was executed directly.");
    main().catch(console.error);
} else {
    Logger.info("tle script was not executed directly, not downloading data...");
}

module.exports = {
    findSatellitePasses
};
