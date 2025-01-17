import fetch from 'node-fetch';
import PQueue from 'p-queue';
import debug from 'debug';

const logError = debug('pollinations:error');
const logServer = debug('pollinations:server');

// Server storage by type
const SERVERS = {
    flux: [],
    translate: [],
    turbo: []
};

const SERVER_TIMEOUT = 45000; // 45 seconds
const MAIN_SERVER_URL = process.env.POLLINATIONS_MASTER_URL || 'https://image.pollinations.ai/register';

const IS_MAIN_SERVER = MAIN_SERVER_URL === 'https://image.pollinations.ai/register';

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
    Object.entries(SERVERS).forEach(([type, servers]) => {
        if (servers.length > 0) {
            const serverQueueInfo = servers.map(server => ({
                type,
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
 * Returns the total number of jobs for a specific type
 * @param {string} type - The type of service (default: 'flux')
 * @returns {number} Total number of jobs (size + pending) across all queues
 */
export const countJobs = (type = 'flux') => {
    const servers = SERVERS[type] || [];
    return servers.reduce((total, server) => {
        return total + server.queue.size + server.queue.pending;
    }, 0);
};

// Wrapper for backward compatibility
export const countFluxJobs = () => countJobs('flux');

/**
 * Registers a new server or updates its last heartbeat time.
 * @param {string} url - The URL of the server.
 * @param {string} type - The type of service (default: 'flux')
 */
export const registerServer = (url, type = 'flux') => {
    // Only allow predefined types, fall back to 'flux' for unknown types
    if (!SERVERS.hasOwnProperty(type)) {
        logServer(`Warning: Unknown server type "${type}", defaulting to "flux"`);
        type = 'flux';
    }

    const servers = SERVERS[type];
    const existingServer = servers.find(server => server.url === url);

    if (existingServer) {
        existingServer.lastHeartbeat = Date.now();
        logServer(`Updated heartbeat for ${type} server ${url}`);
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
        logServer(`Registered new ${type} server ${url}`);
    }
};

/**
 * Returns the next available server URL for a specific type
 * @param {string} type - The type of service (default: 'flux')
 * @returns {Promise<string>} - The next server URL
 */
export const getNextServerUrl = async (type = 'flux') => {
    const servers = SERVERS[type] || [];
    if (!IS_MAIN_SERVER && servers.length === 0) {
        await fetchServersFromMainServer();
    }

    const activeServers = filterActiveServers(servers);
    if (activeServers.length === 0) {
        throw new Error(`No active ${type} servers available`);
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
export const getNextTranslationServerUrl = () => getNextServerUrl('translate');
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
            registerServer(server.url, server.type);
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
                if (server.url) {
                    registerServer(server.url, server.type || 'flux');
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: true, message: 'Server registered successfully' }));
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end(JSON.stringify({ success: false, message: 'Invalid request body - url is required' }));
                }
            } catch (error) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, message: 'Invalid JSON' }));
            }
        });
    } else if (req.method === 'GET') {
        const availableServers = Object.entries(SERVERS).map(([type, servers]) => servers.map(server => ({ ...server, type }))).flat();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(availableServers.map(server => ({
            url: server.url,
            queueSize: server.queue.size + server.queue.pending,
            totalRequests: server.totalRequests,
            errors: server.errors,
            errorRate: ((server.errors / server.totalRequests) * 100 || 0).toFixed(2) + '%',
            requestsPerSecond: (server.totalRequests / ((Date.now() - server.startTime) / 1000)).toFixed(2),
            type: server.type
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
 * Fetches data from the least busy server of a specific type
 * @param {string} type - The type of service (default: 'flux')
 * @param {Object} options - The fetch options
 * @returns {Promise<Response>} - The fetch response
 */
export const fetchFromLeastBusyServer = async (type = 'flux', options) => {
    const serverUrl = await getNextServerUrl(type);
    const server = SERVERS[type].find(s => s.url === serverUrl);
    
    if (!server) {
        throw new Error(`Server ${serverUrl} not found for type ${type}`);
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