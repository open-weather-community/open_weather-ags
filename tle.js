const axios = require('axios');
const satellite = require('satellite.js');
const geolib = require('geolib');
const { DateTime } = require('luxon');
const fs = require('fs');
const Logger = require('./logger');

// Parse command-line arguments to get configPath
const args = process.argv.slice(2);
if (args.length === 0) {
    console.error('Usage: node tle.js <configPath>');
    process.exit(1);
}
const configPath = args[0];

function loadConfig(configPath) {
    if (!fs.existsSync(configPath)) {
        console.error('Config file not found.');
        process.exit(1);
    }

    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

// Load the configuration
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

function isOverLocation(distance) {
    return distance <= maxDistance;
}

function calculateDistance(satLat, satLon, locLat, locLon) {
    return geolib.getDistance(
        { latitude: satLat, longitude: satLon },
        { latitude: locLat, longitude: locLon }
    );
}

async function fetchTLEData() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle';
    const response = await axios.get(url);
    return response.data;
}

function readExistingPasses() {
    if (fs.existsSync(passesFile)) {
        const data = fs.readFileSync(passesFile, 'utf8');
        if (data.trim() === '') {
            return [];
        }
        try {
            return JSON.parse(data);
        } catch (error) {
            console.error('Error parsing existing passes JSON:', error.message);
            return [];
        }
    }
    return [];
}

function savePasses(passes) {
    passes.sort((a, b) => {
        const dateTimeA = DateTime.fromFormat(`${a.date} ${a.time}`, 'dd LLL yyyy HH:mm');
        const dateTimeB = DateTime.fromFormat(`${b.date} ${b.time}`, 'dd LLL yyyy HH:mm');
        return dateTimeA - dateTimeB;
    });
    fs.writeFileSync(passesFile, JSON.stringify(passes, null, 2));
}

async function findSatellitePasses(satName, tleLine1, tleLine2) {
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
            const distance = calculateDistance(satLat, satLon, locLat, locLon);

            if (isOverLocation(distance)) {
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
                        start: passStart,
                        end: currentTime,
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
            start: passStart,
            end: currentTime,
            maxElevation: maxElevation.toFixed(2),
            avgElevation: avgElevation.toFixed(2)
        });
    }

    return passes;
}

async function processPasses() {
    const tleData = await fetchTLEData();
    const tleLines = tleData.split('\n').filter(line => line.trim() !== '');

    Logger.info(`Found TLE data for ${tleLines.length / 3} satellites.`);

    const existingPasses = readExistingPasses();

    for (const satName in noaaFrequencies) {
        let tleLine1, tleLine2;
        for (let i = 0; i < tleLines.length; i++) {
            if (tleLines[i].startsWith(satName)) {
                tleLine1 = tleLines[i + 1];
                tleLine2 = tleLines[i + 2];
                break;
            }
        }

        if (!tleLine1 || tleLine2) {
            Logger.error(`TLE data for ${satName} not found.`);
            continue;
        }

        const passes = await findSatellitePasses(satName, tleLine1, tleLine2);

        passes.forEach(pass => {
            const formattedStart = DateTime.fromISO(pass.start.toISO());
            const formattedEnd = DateTime.fromISO(pass.end.toISO());
            const maxElevation = pass.maxElevation || 'N/A';
            const avgElevation = pass.avgElevation || 'N/A';
            const avgDistance = pass.avgDistance || 'N/A';
            const minDistance = pass.minDistance || 'N/A';

            const bufferStart = formattedStart.minus({ minutes: bufferMinutes });
            const bufferEnd = formattedEnd.plus({ minutes: bufferMinutes });
            const bufferDuration = Math.round((bufferEnd - bufferStart) / (1000 * 60));

            const newPass = {
                frequency: noaaFrequencies[satName],
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

            const duplicate = existingPasses.some(
                existingPass =>
                    existingPass.satellite === newPass.satellite &&
                    existingPass.date === newPass.date &&
                    existingPass.time === newPass.time
            );

            if (!duplicate) {
                existingPasses.push(newPass);
            }
        });
    }

    savePasses(existingPasses);
    Logger.info('Satellite passes have been updated and saved.');
}

if (require.main === module) {
    Logger.info("tle script was executed directly.");

    Logger.info("setting up config...");

    // Ensure the Logger is set up with the configuration
    Logger.setConfig(config);

    processPasses().catch(console.error);
} else {
    Logger.info("tle script was not executed directly, not downloading data...");
}

module.exports = {
    processPasses
};
