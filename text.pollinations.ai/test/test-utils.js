import http from 'http';
import axios from 'axios';
import debug from 'debug';

const log = debug('pollinations:test');
const errorLog = debug('pollinations:test:error');

/**
 * Creates a test server and axios instance for integration tests
 * 
 * @param {Object} app - Express app instance
 * @returns {Promise<Object>} Object containing server, baseUrl, and axiosInstance
 */
export async function setupTestServer(app) {
    return new Promise((resolve, reject) => {
        const server = http.createServer(app);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const baseUrl = `http://127.0.0.1:${address.port}`;
            log(`Test server started at ${baseUrl}`);
            
            // Create axios instance with base URL
            const axiosInstance = axios.create({
                baseURL: baseUrl,
                validateStatus: status => true, // Don't throw on any status
                headers: {
                    'Referer': 'roblox'
                },
                params: {
                    code: 'BeesKnees'
                }
            });
            
            resolve({ server, baseUrl, axiosInstance });
        });
        
        server.on('error', reject);
    });
}

/**
 * Generates a random seed for consistent but varied responses.
 * @returns {number} A random integer between 0 and 999999.
 */
export function generateRandomSeed() {
    return Math.floor(Math.random() * 1000000);
}

/**
 * Creates a promise that resolves with feed messages
 * 
 * @param {string} baseUrl - Base URL of the test server
 * @param {number} timeout - Time to wait for messages in milliseconds
 * @returns {Promise<Array>} Promise that resolves with received messages
 */
export function collectFeedMessages(baseUrl, timeout = 2000) {
    const receivedMessages = [];
    
    return new Promise((resolve, reject) => {
        let feedResponse;
        let timeoutId;
        
        try {
            axios.get(`${baseUrl}/feed`, {
                responseType: 'stream'
            }).then(response => {
                feedResponse = response;
                
                response.data.on('data', chunk => {
                    const lines = chunk.toString().split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            try {
                                const data = JSON.parse(line.slice(6));
                                receivedMessages.push(data);
                            } catch (error) {
                                errorLog('Error parsing SSE data:', error);
                            }
                        }
                    }
                });
                
                response.data.on('error', (err) => {
                    errorLog('Feed stream error:', err);
                    clearTimeout(timeoutId);
                    if (response && response.data) {
                        response.data.removeAllListeners();
                        response.data.destroy();
                    }
                    resolve(receivedMessages);
                });

                // Resolve after a delay to allow messages to be received
                timeoutId = setTimeout(() => {
                    log('Feed collection timeout reached, resolving with collected messages');
                    if (response && response.data) {
                        response.data.removeAllListeners();
                        response.data.destroy();
                    }
                    resolve(receivedMessages);
                }, timeout);
            }).catch(err => {
                errorLog('Error connecting to feed:', err);
                clearTimeout(timeoutId);
                resolve([]);
            });
        } catch (error) {
            errorLog('Unexpected error in collectFeedMessages:', error);
            if (timeoutId) clearTimeout(timeoutId);
            if (feedResponse && feedResponse.data) {
                feedResponse.data.removeAllListeners();
                feedResponse.data.destroy();
            }
            resolve([]);
        }
    });
}
