import test from 'ava';
import axios from 'axios';
import app from '../server.js';
import http from 'http';
import debug from 'debug';

const log = debug('pollinations:test:cloudflare');
const errorLog = debug('pollinations:test:cloudflare:error');

// Configure higher timeout for all tests
test.beforeEach(t => {
    t.timeout(60000); // 60 seconds in milliseconds
});

let server;
let baseUrl;
let axiosInstance;

// Start local server before tests
test.before(async t => {
    await new Promise((resolve, reject) => {
        server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            baseUrl = `http://127.0.0.1:${address.port}`;
            log(`Test server started at ${baseUrl}`);
            // Create axios instance with base URL
            axiosInstance = axios.create({
                baseURL: baseUrl,
                validateStatus: status => true, // Don't throw on any status
                headers: {
                    'Referer': 'test'
                }
            });
            resolve();
        });
        server.on('error', reject);
    });
});

// Clean up server after tests
test.after.always(t => {
    if (server) {
        server.close();
    }
});
