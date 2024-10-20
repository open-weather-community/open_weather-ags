require('dotenv').config(); // Load environment variables from .env file
const { uploadFile } = require('./upload');
const configFile = "/media/openweather/O-W/ow-config.json";

// get auth_token from configFile
const configData = fs.readFileSync(configFile, 'utf8');
const configJson = JSON.parse(configData);
const auth_token = configJson.auth_token;

const filePath = './recordings/test.wav';
const jsonData = {
    "ID": '3159',
    "satellite": 'NOAA-19',
    "locLat": 52.495480,
    "locLon": 13.468430,
    "gain": 38.0,
    "timestamp": '1999-09-01T12:00:00Z',
    "auth_token": auth_token
};

uploadFile(filePath, jsonData)
    .then(response => {
        // Handle success if needed
        console.log('Response:', response);
    })
    .catch(error => {
        // Handle error if needed
        console.error('Error:', error);
    });
