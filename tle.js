// test script to grab TLE from celestrak and find satellite passes over a specific location
// npm install axios satellite.js geolib luxon

const axios = require('axios');
const satellite = require('satellite.js');
const geolib = require('geolib');
const { DateTime } = require('luxon');
const fs = require('fs');

const config = require('./config.json');
const maxDistance = config.maxDistance;
const locLat = config.locLat;
const locLon = config.locLon;
const noaaFrequencies = config.noaaFrequencies;
const passesFile = config.passesFile;
const daysToPropagate = config.daysToPropagate;
const bufferMinutes = config.bufferMinutes;

// check if the satellite passes over the given location within a certain distance
function isOverLocation(distance) {
    return distance <= maxDistance;
}

// function to calculate distance between two points
function calculateDistance(satLat, satLon, locLat, locLon) {
    return geolib.getDistance(
        { latitude: satLat, longitude: satLon },
        { latitude: locLat, longitude: locLon }
    );
}

// fetch TLE data from Celestrak
async function fetchTLEData() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle';
    const response = await axios.get(url);
    return response.data;
}

// read existing passes from the file
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

// save passes to the file
function savePasses(passes) {
    passes.sort((a, b) => {
        const dateTimeA = DateTime.fromFormat(`${a.date} ${a.time}`, 'dd LLL yyyy HH:mm');
        const dateTimeB = DateTime.fromFormat(`${b.date} ${b.time}`, 'dd LLL yyyy HH:mm');
        return dateTimeA - dateTimeB;
    });
    fs.writeFileSync(passesFile, JSON.stringify(passes, null, 2));
}

// find satellite passes over a specific location
async function findSatellitePasses(satName, tleLine1, tleLine2) {
    // create a satellite record
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);

    // time range for propagation
    const startTime = DateTime.utc();
    const endTime = startTime.plus({ days: daysToPropagate }); // Propagate for specified days
    const timeStep = { minutes: 1 }; // Propagation step

    // loop through the time range and propagate the satellite's position
    let currentTime = startTime;
    let passStart = null;
    const passes = [];
    let elevations = [];
    let distances = [];

    // find satellite passes over the location, with a resolution of 1 minute
    while (currentTime < endTime) {
        const positionAndVelocity = satellite.propagate(satrec, currentTime.toJSDate());
        const positionEci = positionAndVelocity.position;

        if (positionEci) {
            const gmst = satellite.gstime(currentTime.toJSDate());
            // convert to lat/long coords (geodetic)
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);
            const satLat = satellite.degreesLat(positionGd.latitude);
            const satLon = satellite.degreesLong(positionGd.longitude);
            const distance = calculateDistance(satLat, satLon, locLat, locLon);

            if (isOverLocation(distance)) {
                const observerGd = {
                    longitude: satellite.degreesToRadians(locLon),
                    latitude: satellite.degreesToRadians(locLat),
                    height: 0 // height in meters
                };
                const positionEcf = satellite.eciToEcf(positionEci, gmst);
                const lookAngles = satellite.ecfToLookAngles(observerGd, positionEcf);
                const elevation = satellite.radiansToDegrees(lookAngles.elevation);

                if (!passStart) {
                    passStart = currentTime;
                    elevations = []; // reset elevations for the new pass
                }

                elevations.push(elevation);
                distances.push(distance);
            } else {
                if (passStart) {
                    const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
                    const maxElevation = Math.max(...elevations);
                    const avgDistance = distances.reduce((sum, el) => sum + el, 0) / distances.length;
                    const minDistance = Math.min(...distances);

                    passes.push({ start: passStart, end: currentTime, maxElevation: maxElevation.toFixed(2), avgElevation: avgElevation.toFixed(2), avgDistance: avgDistance.toFixed(2), minDistance: minDistance.toFixed(2) });
                    passStart = null;
                }
            }
        }

        currentTime = currentTime.plus(timeStep);
    }

    // check if there was an ongoing pass at the end of the time range
    if (passStart) {
        const avgElevation = elevations.reduce((sum, el) => sum + el, 0) / elevations.length;
        const maxElevation = Math.max(...elevations);
        passes.push({ start: passStart, end: currentTime, maxElevation: maxElevation.toFixed(2), avgElevation: avgElevation.toFixed(2) });
    }

    return passes;
}


// process passes and save to file
async function processPasses() {
    const tleData = await fetchTLEData();
    const tleLines = tleData.split('\n').filter(line => line.trim() !== '');

    console.log(`Found TLE data for ${tleLines.length / 3} satellites.`);

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

        if (!tleLine1 || !tleLine2) {
            console.error(`TLE data for ${satName} not found.`);
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

            // apply buffer
            const bufferStart = formattedStart.minus({ minutes: bufferMinutes });
            const bufferEnd = formattedEnd.plus({ minutes: bufferMinutes });
            const bufferDuration = Math.round((bufferEnd - bufferStart) / (1000 * 60)); // buffer duration in minutes

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

            // check for duplicates before adding
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

    // save updated passes
    savePasses(existingPasses);

    console.log('Satellite passes have been updated and saved.');
}


if (require.main === module) {
    console.log("tle script was executed directly.");
    // execute the process passes
    processPasses().catch(console.error);
} else {
    console.log("tle script was not executed directly, not downloading data...");
}


module.exports = {
    processPasses
};
