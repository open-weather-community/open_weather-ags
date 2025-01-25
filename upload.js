// upload.js
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

        // Return a structured failure
        return {
            success: false,
            message: error.message,
            ...(error.response && { status: error.response.status, data: error.response.data })
        };
    }
};

/**
 * Attempts to upload the file multiple times if it fails.
 * @param {string} filePath - Path to the WAV file
 * @param {object} jsonData - The JSON metadata to send along
 * @param {object} logger - Your logger instance
 * @param {number} [maxRetries=3] - How many times to try before giving up
 * @param {number} [delayMs=5000] - Delay (in ms) between attempts
 * @returns {object} - The successful response data or a final failure object
 */
const uploadFileWithRetries = async (filePath, jsonData, logger, maxRetries = 3, delayMs = 5000) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        logger.info(`Upload attempt #${attempt} of ${maxRetries}`);
        const response = await uploadFile(filePath, jsonData, logger);

        if (response && response.success !== false) {
            // The upload succeeded
            return response;
        } else {
            logger.error(`Upload attempt #${attempt} failed. Response: ${JSON.stringify(response)}`);
        }

        // If there's still another attempt left, wait before retrying
        if (attempt < maxRetries) {
            logger.info(`Waiting ${delayMs} ms before the next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    // If we exhaust all retries, return a final failure
    return {
        success: false,
        message: `All ${maxRetries} upload attempts failed.`
    };
};

module.exports = {
    uploadFile,
    uploadFileWithRetries
};
