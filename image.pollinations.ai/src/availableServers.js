import fetch from 'node-fetch';
import PQueue from 'p-queue';
import debug from 'debug';

const logError = debug('pollinations:error');
const logServer = debug('pollinations:server');

let FLUX_SERVERS = [];
const SERVER_TIMEOUT = 45000; // 45 seconds
const MAIN_SERVER_URL = 'https://image.pollinations.ai/register';

const concurrency = 2;

// Decay errors every minute
setInterval(() => {
    FLUX_SERVERS.forEach(server => {
        if (server.errors > 0) {
            server.errors--;
            logServer(`Decreased errors for ${server.url} to ${server.errors}`);
        }
    });
}, 60 * 1000); // Every 1 minute

// Log server queue info every 5 seconds
setInterval(() => {
    if (FLUX_SERVERS.length > 0) {
        const serverQueueInfo = FLUX_SERVERS.map(server => ({
            url: server.url,
            queueSize: server.queue.size + server.queue.pending,
            totalRequests: server.totalRequests,
            errors: server.errors,
            errorRate: ((server.errors / server.totalRequests) * 100 || 0).toFixed(2) + '%',
            requestsPerSecond: (server.totalRequests / ((Date.now() - server.startTime) / 1000)).toFixed(2)
        }));
        console.table(serverQueueInfo);
    }
}, 5000);

/**
 * Returns the total number of jobs across all FLUX server queues
 * @returns {number} Total number of jobs (size + pending) across all queues
 */
export const countFluxJobs = () => {
    return FLUX_SERVERS.reduce((total, server) => {
        return total + server.queue.size + server.queue.pending;
    }, 0);
};

/**
 * Registers a new FLUX server or updates its last heartbeat time.
 * @param {string} url - The URL of the FLUX server.
 */
export const registerServer = ({ url }) => {
    const existingServer = FLUX_SERVERS.find(server => server.url === url);
    if (existingServer) {
        existingServer.lastHeartbeat = Date.now();
    } else {
        FLUX_SERVERS.push({
            url,
            lastHeartbeat: Date.now(),
            queue: new PQueue({ concurrency }),
            totalRequests: 0,
            errors: 0,
            startTime: Date.now()
        });
    }
};

/**
 * Returns the next available FLUX server URL with the least amount of jobs processing + in queue.
 * If multiple servers have the smallest queue size, one is selected randomly.
 * @returns {Promise<string>} - The next FLUX server URL.
 */
const getNextFluxServerUrl = async () => {
    FLUX_SERVERS = filterActiveServers(FLUX_SERVERS);

    if (FLUX_SERVERS.length === 0) {
        await fetchServersFromMainServer();
    }

    if (FLUX_SERVERS.length === 0) {
        throw new Error("No available FLUX servers.");
    }

    const weightedLoad = FLUX_SERVERS.map(server => ({
        server,
        load: (server.queue.size + server.queue.pending) + (server.errors)
    }));

    const minLoad = Math.min(...weightedLoad.map(w => w.load));
    const leastLoadedServers = weightedLoad
        .filter(w => w.load === minLoad)
        .map(w => w.server);

    const server = leastLoadedServers[Math.floor(Math.random() * leastLoadedServers.length)];
    logServer(`Selected server: ${server.url}`);
    return server.url + "/generate";
};


/**
 * Returns the next available Translation server URL with the least amount of jobs processing + in queue.
 * If multiple servers have the smallest queue size, one is selected randomly.
 * @returns {Promise<string>} - The next Translation server URL.
 */
export async function getNextTranslationServerUrl() {
    const nextFluxServer = await getNextFluxServerUrl();
    //extract ip from url (the url has http:// or https://, we need the ip)
    const ip = nextFluxServer.split("://")[1].split(":")[0];
    return `http://${ip}:5000`;
}

/**
 * Returns the next available Turbo server URL with the least amount of jobs processing + in queue.
 * If multiple servers have the smallest queue size, one is selected randomly.
 * @returns {Promise<string>} - The next Turbo server URL.
 */
export async function getNextTurboServerUrl() {
    const nextFluxServer = await getNextFluxServerUrl();
    //extract ip from url (the url has http:// or https://, we need the ip)
    const ip = nextFluxServer.split("://")[1].split(":")[0];
    return `http://${ip}:5003/generate`;
}


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
        
        FLUX_SERVERS = servers.map(server => ({
            ...server,
            queue: new PQueue({ concurrency }),
            totalRequests: 0,
            errors: 0,
            startTime: Date.now()
        }));
        logServer(`[${new Date().toISOString()}] Successfully initialized ${FLUX_SERVERS.length} FLUX servers`);
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
                    registerServer(server);
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
        const availableServers = filterActiveServers(FLUX_SERVERS);
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
const filterActiveServers = (servers) => {
    return servers.filter(server =>
        Date.now() - server.lastHeartbeat < SERVER_TIMEOUT 
        // && server.url.includes('23.23.212.46')
    );
};

/**
 * Fetches data from the server with the least amount of jobs processing + in queue.
 * @param {string} url - The URL to fetch.
 * @param {Object} options - The fetch options.
 * @returns {Promise<Response>} - The fetch response.
 */
export const fetchFromLeastBusyFluxServer = async (options) => {
    const server = await getNextFluxServerUrl();
    const chosenServer = FLUX_SERVERS.find(s => s.url + "/generate" === server);
    chosenServer.totalRequests += 1;
    
    return chosenServer.queue.add(async () => {
        try {
            const response = await fetch(server, options);
            if (!response.ok) {
                chosenServer.errors += 1;
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response;
        } catch (error) {
            chosenServer.errors += 1;
            throw error;
        }
    });
};