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
                'Authorization': `Bearer ${jsonData.auth_token}`,
                'User-Agent': 'OpenWeather-AGS/1.0'
            },
            timeout: 60000, // 60 second timeout
            onUploadProgress: progressEvent => {
                const percentCompleted = Math.round(progressEvent.loaded / progressEvent.total * 100);
                console.log(`Uploaded ${percentCompleted}%`);
                if (logger) logger.info(`Upload progress: ${percentCompleted}%`);
            }
        };

        const url = 'https://open-weather.community/wp-json/ow/v1/ground-stations';
        logger.info(`Starting upload to ${url}`);

        const response = await axios.post(url, form, config);

        logger.info('Upload completed successfully');
        logger.info('Upload response:', response.data);
        return response.data;

    } catch (error) {
        let errorMessage = error.message;
        let isNetworkError = false;

        // Detect network-related errors
        if (error.code === 'EAI_AGAIN' ||
            error.code === 'ENOTFOUND' ||
            error.code === 'ECONNREFUSED' ||
            error.code === 'ETIMEDOUT' ||
            error.code === 'ECONNRESET' ||
            error.message.includes('EAI_AGAIN') ||
            error.message.includes('ENOTFOUND') ||
            error.message.includes('getaddrinfo') ||
            error.message.includes('timeout')) {

            isNetworkError = true;
            errorMessage = `Network error during upload: ${error.code || error.message}`;
            logger.error(errorMessage);
            logger.error('This indicates DNS resolution or connectivity issues');
        } else if (error.response) {
            // Server responded with a status other than 2xx
            errorMessage = `Server error: ${error.response.status} - ${error.response.statusText}`;
            logger.error('Server responded with an error:', error.response.status, error.response.data);
        } else if (error.request) {
            // Request was made but no response was received
            isNetworkError = true;
            errorMessage = 'No response received from server (network timeout or connection issue)';
            logger.error('No response received from server:', error.request);
        } else {
            // Something else happened while setting up the request
            logger.error('Error setting up the request:', error.message);
        }

        // Return a structured failure with network error indication
        return {
            success: false,
            message: errorMessage,
            isNetworkError: isNetworkError,
            errorCode: error.code,
            ...(error.response && { status: error.response.status, data: error.response.data })
        };
    }
};

/**
 * Attempts to upload the file multiple times if it fails.
 * @param {string} filePath - Path to the WAV file
 * @param {object} jsonData - The JSON metadata to send along
 * @param {object} logger - Your logger instance
 * @param {number} [maxRetries=5] - How many times to try before giving up
 * @param {number} [delayMs=10000] - Delay (in ms) between attempts
 * @returns {object} - The successful response data or a final failure object
 */
const uploadFileWithRetries = async (filePath, jsonData, logger, maxRetries = 5, delayMs = 10000) => {
    let lastResponse = null;
    let consecutiveNetworkErrors = 0;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        logger.info(`Upload attempt #${attempt} of ${maxRetries}`);
        const response = await uploadFile(filePath, jsonData, logger);

        if (response && response.success !== false) {
            // The upload succeeded
            logger.info('Upload completed successfully');
            return response;
        } else {
            lastResponse = response;
            logger.error(`Upload attempt #${attempt} failed. Response: ${JSON.stringify(response)}`);

            // Track consecutive network errors
            if (response && response.isNetworkError) {
                consecutiveNetworkErrors++;
                logger.warn(`Consecutive network errors: ${consecutiveNetworkErrors}`);

                // If we have multiple consecutive network errors, increase delay
                if (consecutiveNetworkErrors >= 2) {
                    const extendedDelay = delayMs * Math.min(consecutiveNetworkErrors, 4); // Cap at 4x delay
                    logger.info(`Multiple network errors detected, extending delay to ${extendedDelay}ms`);

                    // Wait before retrying, but only if there's another attempt left
                    if (attempt < maxRetries) {
                        logger.info(`Waiting ${extendedDelay} ms before the next attempt...`);
                        await new Promise(resolve => setTimeout(resolve, extendedDelay));
                    }
                    continue;
                }
            } else {
                // Reset counter on non-network errors
                consecutiveNetworkErrors = 0;
            }

            // For server errors (4xx, 5xx), don't retry as aggressively
            if (response && response.status && response.status >= 400 && response.status < 500) {
                logger.error(`Client error ${response.status} - not retrying`);
                break;
            }
        }

        // If there's still another attempt left, wait before retrying
        if (attempt < maxRetries) {
            logger.info(`Waiting ${delayMs} ms before the next attempt...`);
            await new Promise(resolve => setTimeout(resolve, delayMs));
        }
    }

    // If we exhaust all retries, return a final failure with detailed info
    const finalError = {
        success: false,
        message: `All ${maxRetries} upload attempts failed.`,
        lastError: lastResponse,
        consecutiveNetworkErrors: consecutiveNetworkErrors
    };

    logger.error('Upload failed after all retries:', finalError);
    return finalError;
};

module.exports = {
    uploadFile,
    uploadFileWithRetries
};
