const fs = require('fs');
const FormData = require('form-data');
const axios = require('axios');

const uploadFile = async (filePath, jsonData, logger) => {
    try {
        // Check if the file exists
        if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
        }

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
                'Authorization': `Bearer ${jsonData.auth_token}`
            },
            onUploadProgress: progressEvent => {
                console.log(`Uploaded ${Math.round(progressEvent.loaded / progressEvent.total * 100)}%`);
            }
        };

        const url = 'https://open-weather.community/wp-json/ow/v1/ground-stations';

        const response = await axios.post(url, form, config);
        logger.info('Upload response:', response.data);
        return response.data;
    } catch (error) {
        if (error.response) {
            // Server responded with a status other than 2xx
            logger.error('Server responded with an error:', error.response.status, error.response.data);
        } else if (error.request) {
            // Request was made but no response was received
            logger.error('No response received from server:', error.request);
        } else {
            // Something else happened while setting up the request
            logger.error('Error setting up the request:', error.message);
        }

        // Return a meaningful error message or status code
        return {
            success: false,
            message: error.message,
            ...(error.response && { status: error.response.status, data: error.response.data })
        };
    }
};

module.exports = {
    uploadFile
};