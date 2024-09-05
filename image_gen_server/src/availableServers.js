import fetch from 'node-fetch';

let FLUX_SERVERS = [];
let currentServerIndex = 0;
const SERVER_TIMEOUT = 45000; // 45 seconds
const MAIN_SERVER_URL = 'https://image.pollinations.ai/register';

/**
 * Registers a new FLUX server or updates its last heartbeat time.
 * @param {string} url - The URL of the FLUX server.
 */
export const registerServer = ({ url }) => {
    const existingServer = FLUX_SERVERS.find(server => server.url === url);
    if (existingServer) {
        existingServer.lastHeartbeat = Date.now();
    } else {
        FLUX_SERVERS.push({ url, lastHeartbeat: Date.now() });
    }
};

/**
 * Returns the next available FLUX server URL in a round-robin fashion.
 * @returns {Promise<string>} - The next FLUX server URL.
 */
export const getNextFluxServerUrl = async () => {
    console.log("FLUX_SERVERS", FLUX_SERVERS);
    FLUX_SERVERS = filterActiveServers(FLUX_SERVERS);

    if (FLUX_SERVERS.length === 0) {
        await fetchServersFromMainServer();
    }

    if (FLUX_SERVERS.length === 0) {
        throw new Error("No available FLUX servers.");
    }

    const server = FLUX_SERVERS[currentServerIndex % FLUX_SERVERS.length];
    currentServerIndex = (currentServerIndex + 1) % FLUX_SERVERS.length;
    return server.url + "/generate";
};

/**
 * Fetches the list of available servers from the main server.
 */
async function fetchServersFromMainServer() {
    try {
        const response = await fetch(MAIN_SERVER_URL);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        FLUX_SERVERS = await response.json();
        console.log("Fetched servers from main server:", FLUX_SERVERS);
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
        res.end(JSON.stringify(availableServers));
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