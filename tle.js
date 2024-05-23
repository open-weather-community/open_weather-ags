// test script to grab TLE from celestrak and find satellite passes over a specific location
// npm install axios satellite.js geolib luxon

const axios = require('axios');
const satellite = require('satellite.js');
const geolib = require('geolib');
const { DateTime } = require('luxon');

const maximumDistance = 2000000;    // was 500000
const locLat = 52.495480;
const locLon = 13.468430;

// Function to check if the satellite passes over the given location within a certain distance
function isOverLocation(satLat, satLon, locLat, locLon, maxDistance = maximumDistance) {
    const distance = geolib.getDistance(
        { latitude: satLat, longitude: satLon },
        { latitude: locLat, longitude: locLon }
    );
    return distance <= maxDistance;
}

// Function to fetch TLE data from Celestrak
async function fetchTLEData() {
    const url = 'https://celestrak.org/NORAD/elements/gp.php?GROUP=noaa&FORMAT=tle';
    const response = await axios.get(url);
    return response.data;
}

// Function to find satellite passes over a specific location
async function findSatellitePasses() {
    const tleData = await fetchTLEData();
    const tleLines = tleData.split('\n').filter(line => line.trim() !== '');

    console.log(`Found TLE data for ${tleLines.length / 3} satellites.`);
    console.log('Example TLE data:', tleLines.slice(0, 3));


    // Extract TLE lines for a specific satellite (e.g., NOAA 19)
    const satName = 'NOAA 19';
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
        return;
    }

    // Create a satellite record
    const satrec = satellite.twoline2satrec(tleLine1, tleLine2);

    // Time range for propagation
    const startTime = DateTime.utc();
    const endTime = startTime.plus({ days: 1 });  // Propagate for one day
    const timeStep = { minutes: 1 };  // Propagation step

    // Loop through the time range and propagate the satellite's position
    let currentTime = startTime;
    let passStart = null;
    const passes = [];

    while (currentTime < endTime) {
        const positionAndVelocity = satellite.propagate(satrec, currentTime.toJSDate());
        const positionEci = positionAndVelocity.position;

        if (positionEci) {
            const gmst = satellite.gstime(currentTime.toJSDate());
            const positionGd = satellite.eciToGeodetic(positionEci, gmst);

            const satLat = satellite.degreesLat(positionGd.latitude);
            const satLon = satellite.degreesLong(positionGd.longitude);

            if (isOverLocation(satLat, satLon, locLat, locLon)) {
                if (!passStart) {
                    passStart = currentTime;
                }
            } else {
                if (passStart) {
                    passes.push({ start: passStart, end: currentTime });
                    passStart = null;
                }
            }
        }

        currentTime = currentTime.plus(timeStep);
    }

    // Check if there was an ongoing pass at the end of the time range
    if (passStart) {
        passes.push({ start: passStart, end: endTime });
    }

    // Print the times when the satellite passes over the location
    console.log(`Satellite ${satName} passes over the location at the following times (UTC):`);
    if (passes.length === 0) {
        console.log('No passes found within the specified time range.');
    } else {
        passes.forEach(pass => {
            const formattedStart = DateTime.fromISO(pass.start.toISO()).toFormat('yyyy LLL dd - HH:mm:ss');
            const formattedEnd = DateTime.fromISO(pass.end.toISO()).toFormat('yyyy LLL dd - HH:mm:ss');
            console.log(`${formattedStart} to ${formattedEnd}`);
        });
    }
}

// Execute the function to find satellite passes
findSatellitePasses().catch(console.error);
