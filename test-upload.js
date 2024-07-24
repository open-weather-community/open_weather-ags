// index.js (or your main application file)
require('dotenv').config(); // Load environment variables from .env file
const { uploadFile } = require('./upload');

const filePath = './recordings/test.wav';
const jsonData = {
    ID: '3159'
    // Add other data fields as needed
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
