import fetch from 'node-fetch';
import PQueue from 'p-queue';
import debug from 'debug';

const logError = debug('pollinations:error');
const logServer = debug('pollinations:server');

// Server storage by service type
const SERVERS = {
    flux: [],
    translation: [],
    turbo: []
};

const SERVER_TIMEOUT = 45000; // 45 seconds
const MAIN_SERVER_URL = process.env.POLLINATIONS_MASTER_URL || 'https://image.pollinations.ai/register';

const concurrency = 2;

// Decay errors every minute
setInterval(() => {
    Object.values(SERVERS).forEach(servers => {
        servers.forEach(server => {
            if (server.errors > 0) {
                server.errors--;
                logServer(`Decreased errors for ${server.url} to ${server.errors}`);
            }
        });
    });
}, 60 * 1000); // Every 1 minute

// Log server queue info every 5 seconds
setInterval(() => {
    Object.values(SERVERS).forEach((servers, serviceType) => {
        if (servers.length > 0) {
            const serverQueueInfo = servers.map(server => ({
                url: server.url,
                queueSize: server.queue.size + server.queue.pending,
                totalRequests: server.totalRequests,
                errors: server.errors,
                errorRate: ((server.errors / server.totalRequests) * 100 || 0).toFixed(2) + '%',
                requestsPerSecond: (server.totalRequests / ((Date.now() - server.startTime) / 1000)).toFixed(2)
            }));
            console.table(serverQueueInfo);
        }
    });
}, 10000);

/**
 * Returns the total number of jobs for a specific service type
 * @param {string} serviceType - The type of service (default: 'flux')
 * @returns {number} Total number of jobs (size + pending) across all queues
 */
export const countJobs = (serviceType = 'flux') => {
    const servers = SERVERS[serviceType] || [];
    return servers.reduce((total, server) => {
        return total + server.queue.size + server.queue.pending;
    }, 0);
};

// Wrapper for backward compatibility
export const countFluxJobs = () => countJobs('flux');

/**
 * Registers a new server or updates its last heartbeat time.
 * @param {string} url - The URL of the server.
 * @param {string} serviceType - The type of service (default: 'flux')
 */
export const registerServer = (url, serviceType = 'flux') => {
    if (!SERVERS[serviceType]) {
        SERVERS[serviceType] = [];
    }

    const servers = SERVERS[serviceType];
    const existingServer = servers.find(server => server.url === url);

    if (existingServer) {
        existingServer.lastHeartbeat = Date.now();
        logServer(`Updated heartbeat for ${serviceType} server ${url}`);
    } else {
        const newServer = {
            url,
            queue: new PQueue({ concurrency }),
            lastHeartbeat: Date.now(),
            startTime: Date.now(),
            totalRequests: 0,
            errors: 0
        };
        servers.push(newServer);
        logServer(`Registered new ${serviceType} server ${url}`);
    }
};

/**
 * Returns the next available server URL for a specific service type
 * @param {string} serviceType - The type of service (default: 'flux')
 * @returns {Promise<string>} - The next server URL
 */
export const getNextServerUrl = async (serviceType = 'flux') => {
    const servers = SERVERS[serviceType] || [];
    if (servers.length === 0) {
        await fetchServersFromMainServer();
    }

    const activeServers = filterActiveServers(servers);
    if (activeServers.length === 0) {
        throw new Error(`No active ${serviceType} servers available`);
    }

    // Find servers with minimum queue size
    const minQueueSize = Math.min(...activeServers.map(server => 
        server.queue.size + server.queue.pending
    ));
    
    const candidateServers = activeServers.filter(server => 
        server.queue.size + server.queue.pending === minQueueSize
    );

    // Randomly select one of the servers with minimum queue size
    const selectedServer = candidateServers[Math.floor(Math.random() * candidateServers.length)];
    return selectedServer.url;
};

// Wrapper functions for backward compatibility
export const getNextFluxServerUrl = () => getNextServerUrl('flux');
export const getNextTranslationServerUrl = () => getNextServerUrl('translation');
export const getNextTurboServerUrl = () => getNextServerUrl('turbo');

/**
 * Fetches the list of available servers from the main server.
 */
async function fetchServersFromMainServer() {
    try {
        logServer(`[${new Date().toISOString()}] Fetching servers from ${MAIN_SERVER_URL}...`);
        const response = await fetch(MAIN_SERVER_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const servers = await response.json();
        logServer(`[${new Date().toISOString()}] Received ${servers.length} servers from main server:`);
        servers.forEach((server, index) => {
            logServer(`  ${index + 1}. ${server.url}`);
        });
        
        servers.forEach(server => {
            registerServer(server.url, server.serviceType);
        });
        logServer(`[${new Date().toISOString()}] Successfully initialized ${Object.values(SERVERS).flat().length} servers`);
    } catch (error) {
        logError(`[${new Date().toISOString()}] Failed to fetch servers from main server:`, error);
    }
}

/**
 * Handles the /register endpoint requests.
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
export const handleRegisterEndpoint = (req, res) => {
    if (req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk.toString();
        });
        req.on('end', () => {
            try {
                const server = JSON.parse(body);
                if (server.url && server.serviceType) {
                    registerServer(server.url, server.serviceType);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Server registered successfully' }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid request body' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
            }
        });
    } else if (req.method === 'GET') {
        const availableServers = Object.values(SERVERS).flat();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(availableServers.map(server => ({
            url: server.url,
            queueSize: server.queue.size + server.queue.pending,
            totalRequests: server.totalRequests,
            errors: server.errors,
            errorRate: ((server.errors / server.totalRequests) * 100 || 0).toFixed(2) + '%',
            requestsPerSecond: (server.totalRequests / ((Date.now() - server.startTime) / 1000)).toFixed(2)
        }))));
    } else {
        res.writeHead(405, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, message: 'Method not allowed' }));
    }
};

/**
 * Filters out inactive servers based on the SERVER_TIMEOUT.
 * @param {Array} servers - The list of servers.
 * @returns {Array} - The filtered list of active servers.
 */
export const filterActiveServers = (servers) => {
    const now = Date.now();
    return servers.filter(server =>
        now - server.lastHeartbeat < SERVER_TIMEOUT 
        // && server.url.includes('23.23.212.46')
    );
};

/**
 * Fetches data from the least busy server of a specific service type
 * @param {string} serviceType - The type of service (default: 'flux')
 * @param {Object} options - The fetch options
 * @returns {Promise<Response>} - The fetch response
 */
export const fetchFromLeastBusyServer = async (serviceType = 'flux', options) => {
    const serverUrl = await getNextServerUrl(serviceType);
    const server = SERVERS[serviceType].find(s => s.url === serverUrl);
    
    if (!server) {
        throw new Error(`Server ${serverUrl} not found for service type ${serviceType}`);
    }

    return server.queue.add(async () => {
        server.totalRequests++;
        try {
            const response = await fetch(serverUrl+'/generate', options);
            if (!response.ok) {
                server.errors++;
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            server.errors++;
            throw error;
        }
    });
};

// Wrapper for backward compatibility
export const fetchFromLeastBusyFluxServer = (options) => 
    fetchFromLeastBusyServer('flux', options);