// upload.js
const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');
require('dotenv').config(); // Load environment variables from .env file

const uploadFile = async (filePath, jsonData) => {
    try {
        const fileStream = fs.createReadStream(filePath);
        const form = new FormData();
        form.append('wavfile', fileStream, 'audio.wav');

        // Append additional JSON data to the form
        if (jsonData) {
            Object.keys(jsonData).forEach(key => {
                form.append(key, jsonData[key]);
            });
        }

        const config = {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${process.env.AUTH_TOKEN}`
            },
            onUploadProgress: progressEvent => {
                console.log(`Uploaded ${Math.round(progressEvent.loaded / progressEvent.total * 100)}%`);
            }
        };

        const url = 'https://open-weather.community/wp-json/ow/v1/ground-stations';

        const response = await axios.post(url, form, config);
        console.log('File uploaded successfully:', response.data);
        return response.data;
    } catch (error) {
        console.error('Error uploading file:', error);
        throw error;
    }
};

module.exports = {
    uploadFile
};
