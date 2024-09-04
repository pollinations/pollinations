import fetch from 'node-fetch';

let FLUX_SERVERS = [];
let currentServerIndex = 0;
const SERVER_TIMEOUT = 45000; // 45 seconds

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
 * @returns {string} - The next FLUX server URL.
 */
export const getNextFluxServerUrl = () => {

    console.log("FLUX_SERVERS", FLUX_SERVERS);
    FLUX_SERVERS = FLUX_SERVERS.filter(server =>
        Date.now() - server.lastHeartbeat < SERVER_TIMEOUT
    );
    if (FLUX_SERVERS.length === 0) {
        throw new Error("No available FLUX servers.");
    }
    const server = FLUX_SERVERS[currentServerIndex % FLUX_SERVERS.length];
    currentServerIndex = (currentServerIndex + 1) % FLUX_SERVERS.length;
    return server.url + "/generate";
};
