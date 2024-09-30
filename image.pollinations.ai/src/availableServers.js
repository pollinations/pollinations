import fetch from 'node-fetch';
import PQueue from 'p-queue';

let FLUX_SERVERS = [];
const SERVER_TIMEOUT = 45000; // 45 seconds
const MAIN_SERVER_URL = 'https://image.pollinations.ai/register';

const concurrency = 2;

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
            startTime: Date.now()
        });
    }
};

/**
 * Returns the next available FLUX server URL with the least amount of jobs processing + in queue.
 * If multiple servers have the smallest queue size, one is selected randomly.
 * @returns {Promise<string>} - The next FLUX server URL.
 */
export const getNextFluxServerUrl = async () => {
    FLUX_SERVERS = filterActiveServers(FLUX_SERVERS);

    if (FLUX_SERVERS.length === 0) {
        await fetchServersFromMainServer();
    }

    if (FLUX_SERVERS.length === 0) {
        throw new Error("No available FLUX servers.");
    }

    const serverQueueInfo = FLUX_SERVERS.map(server => ({
        url: server.url,
        queueSize: server.queue.size + server.queue.pending,
        totalRequests: server.totalRequests,
        requestsPerSecond: (server.totalRequests / ((Date.now() - server.startTime) / 1000)).toFixed(2)
    }));
    console.table(serverQueueInfo);

    const minQueueSize = Math.min(...serverQueueInfo.map(info => info.queueSize));
    const leastBusyServers = FLUX_SERVERS.filter(server => (server.queue.size + server.queue.pending) === minQueueSize);
    const server = leastBusyServers[Math.floor(Math.random() * leastBusyServers.length)];

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
        const response = await fetch(MAIN_SERVER_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const servers = await response.json();
        FLUX_SERVERS = servers.map(server => ({
            ...server,
            queue: new PQueue({ concurrency }),
            totalRequests: 0,
            startTime: Date.now()
        }));
    } catch (error) {
        console.error("Failed to fetch servers from main server:", error);
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
    return chosenServer.queue.add(() => fetch(server, options));
};