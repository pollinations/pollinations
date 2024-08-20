import fetch from 'node-fetch';

const FLUX_SERVERS = [
    { url: "http://52.203.206.118:5002", status: true },
    { url: "http://54.91.176.109:5002", status: true },
    { url: "http://52.20.220.68:5002", status: true },
];

let fluxServerIndex = 0;

/**
 * Returns the next FLUX server URL in a round-robin fashion.
 * @returns {string} - The next FLUX server URL.
 */
export const getNextFluxServerUrl = () => {
    const availableServers = FLUX_SERVERS.filter(server => server.status);
    if (availableServers.length === 0) {
        throw new Error("No available FLUX servers.");
    }
    const server = availableServers[fluxServerIndex % availableServers.length];
    fluxServerIndex = (fluxServerIndex + 1) % availableServers.length;
    return server.url + "/generate";
};
/**
 * Checks the status of each FLUX server every 5 seconds.
 */
const checkServerStatus = () => {
    console.log("Server status", FLUX_SERVERS)
    FLUX_SERVERS.forEach(async (server) => {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        try {
            const response = await fetch(server.url, { method: 'GET', signal: controller.signal });
            clearTimeout(timeoutId);

            if (response.ok || response.status === 404) {
                server.status = true;
            } else {
                server.status = false;
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                console.error(`Request to ${server.url} timed out.`);
            } else {
                console.error(`Error checking status of ${server.url}:`, error);
            }
            server.status = false;
        }
    });
};

// Check server status every 5 seconds
setInterval(checkServerStatus, 5000);

