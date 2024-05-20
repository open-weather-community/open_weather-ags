const https = require('https');
const fs = require('fs');
const config = require('./config.json');

const apiOptions = {
    hostname: 'api.example.com',
    port: 443,
    path: '/endpoint',
    method: 'GET',
    headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
    }
};

function fetchApiData(callback) {
    const req = https.request(apiOptions, res => {
        console.log(`statusCode: ${res.statusCode}`);

        let data = '';
        res.on('data', chunk => {
            data += chunk;
        });

        res.on('end', () => {
            const parsedData = JSON.parse(data);
            console.log(parsedData);

            // Save to config.file
            fs.writeFileSync(config.file, JSON.stringify(parsedData));

            if (callback) {
                callback(parsedData);
            }
        });
    });

    req.on('error', error => {
        console.error(error);
    });

    req.end();
}

module.exports = { fetchApiData };
