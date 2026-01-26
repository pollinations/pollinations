import type { IncomingMessage, ServerResponse } from "node:http";
import debug from "debug";
import PQueue from "p-queue";

const logServer = debug("pollinations:server");

type Server = {
    url: string;
    queue: PQueue;
    startTime: number;
    lastHeartbeat: number;
    totalRequests: number;
    errors: number;
};

type ServerMap = typeof SERVERS;
type ServerType = keyof ServerMap;

type ServerInfo = {
    type: ServerType;
    url: string;
    queueSize: number;
    totalRequests: number;
    errors: number;
    errorRate: string;
    requestsPerSecond: string;
};

// Server storage by type
const SERVERS = {
    flux: [] as Server[],
    translate: [] as Server[],
    turbo: [] as Server[],
    zimage: [] as Server[],
};

const SERVER_TIMEOUT = 45000; // 45 seconds

const concurrency = 2;

function decayErrors() {
    Object.values(SERVERS).forEach((servers) => {
        servers.forEach((server) => {
            if (server.errors > 0) {
                server.errors--;
                logServer(
                    `Decreased errors for ${server.url} to ${server.errors}`,
                );
            }
        });
    });
}

function errorRate(server: Server): number {
    return (server.errors / server.totalRequests) * 100 || 0;
}

function requestsPerSecond(server: Server): number {
    return server.totalRequests / ((Date.now() - server.startTime) / 1000);
}

function serverInfo(server: Server, type: ServerType): ServerInfo {
    return {
        type,
        url: server.url,
        queueSize: server.queue.size + server.queue.pending,
        totalRequests: server.totalRequests,
        errors: server.errors,
        errorRate: `${errorRate(server).toFixed(2)}%`,
        requestsPerSecond: requestsPerSecond(server).toFixed(2),
    };
}

function serverQueueInfo(servers: ServerMap): ServerInfo[] {
    return Object.entries(servers).flatMap(([type, servers]) => {
        return servers.map((server) => serverInfo(server, type as ServerType));
    });
}
//            console.table(serverQueueInfo);

// Decay errors every minute
setInterval(decayErrors, 60 * 1000); // Every 1 minute

// Log server queue info every 10 seconds
setInterval(() => console.table(serverQueueInfo(SERVERS)), 10000);

/**
 * Returns the total load (pending + queued jobs) for a specific type
 * Only counts active servers (with recent heartbeats)
 * @param {ServerType} type - The type of service (default: 'flux')
 * @returns {number} Total load across all active servers (pending + queued)
 */
export const countJobs = (type: ServerType = "flux"): number => {
    const servers = SERVERS[type] || [];
    const activeServers = filterActiveServers(servers);
    return activeServers.reduce((total, server) => {
        return total + server.queue.size + server.queue.pending;
    }, 0);
};

// Wrapper for backward compatibility
export const countFluxJobs = () => countJobs("flux");

/**
 * Registers a new server or updates its last heartbeat time.
 * @param {string} url - The URL of the server.
 * @param {string} type - The type of service (default: 'flux')
 */
export const registerServer = (url: string, type: ServerType = "flux") => {
    // Only allow predefined types, fall back to 'flux' for unknown types
    if (!Object.hasOwn(SERVERS, type)) {
        logServer(
            `Warning: Unknown server type "${type}", defaulting to "flux"`,
        );
        type = "flux";
    }

    const servers = SERVERS[type];
    const existingServer = servers.find((server) => server.url === url);

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
            errors: 0,
        };
        servers.push(newServer);
        logServer(`Registered new ${type} server ${url}`);
    }
};

/**
 * Returns the next available server URL for a specific type
 * @param {ServerType} type - The type of service (default: 'flux')
 * @returns {Promise<string>} - The next server URL
 */
export const getNextServerUrl = async (
    type: ServerType = "flux",
): Promise<string> => {
    const servers = SERVERS[type] || [];
    const activeServers = filterActiveServers(servers);
    if (activeServers.length === 0) {
        throw new Error(`No active ${type} servers available`);
    }

    // Find servers with minimum queue size
    const minQueueSize = Math.min(
        ...activeServers.map(
            (server) => server.queue.size + server.queue.pending,
        ),
    );

    const candidateServers = activeServers.filter(
        (server) => server.queue.size + server.queue.pending === minQueueSize,
    );

    // Randomly select one of the servers with minimum queue size
    const selectedServer =
        candidateServers[Math.floor(Math.random() * candidateServers.length)];
    return selectedServer.url;
};

// Wrapper functions for backward compatibility
export const getNextFluxServerUrl = () => getNextServerUrl("flux");
export const getNextTranslationServerUrl = () => getNextServerUrl("translate");
export const getNextTurboServerUrl = () => getNextServerUrl("turbo");

/**
 * Handles the /register endpoint requests.
 * @param {IncomingMessage} req - The request object.
 * @param {Object} res - The response object.
 */
export const handleRegisterEndpoint = (
    req: IncomingMessage,
    res: ServerResponse,
) => {
    if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
            body += chunk.toString();
        });
        req.on("end", () => {
            try {
                const server = JSON.parse(body);
                if (server.url) {
                    registerServer(server.url, server.type || "flux");
                    res.end(
                        JSON.stringify({
                            success: true,
                            message: "Server registered successfully",
                        }),
                    );
                } else {
                    res.end(
                        JSON.stringify({
                            success: false,
                            message: "Invalid request body - url is required",
                        }),
                    );
                }
            } catch (_error) {
                res.end(
                    JSON.stringify({ success: false, message: "Invalid JSON" }),
                );
            }
        });
    } else if (req.method === "GET") {
        const availableServersInfo = Object.entries(SERVERS).flatMap(
            ([type, servers]) =>
                servers.map((server) => serverInfo(server, type as ServerType)),
        );
        // res.writeHead(200, {
        //     'Content-Type': 'application/json',
        //     'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        //     'Pragma': 'no-cache',
        //     'Expires': '0'
        // });
        res.end(JSON.stringify(availableServersInfo));
    } else {
        res.end(
            JSON.stringify({ success: false, message: "Method not allowed" }),
        );
    }
};

/**
 * Filters out inactive servers based on the SERVER_TIMEOUT.
 * @param {Server[]} servers - The list of servers.
 * @returns {Server[]} - The filtered list of active servers.
 */
export const filterActiveServers = (servers: Server[]): Server[] => {
    const now = Date.now();
    return servers.filter(
        (server) => now - server.lastHeartbeat < SERVER_TIMEOUT,
        // && server.url.includes('23.23.212.46')
    );
};

/**
 * Fetches data from the least busy server of a specific type
 * @param {ServerType} type - The type of service (default: 'flux')
 * @param {RequestInit} options - The fetch init options
 * @returns {Promise<Response>} - The fetch response
 */
export const fetchFromLeastBusyServer = async (
    type: ServerType = "flux",
    options: RequestInit,
): Promise<Response> => {
    const maxRetries = 3; // Try up to 3 different servers
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const serverUrl = await getNextServerUrl(type);
        const server = SERVERS[type].find((s) => s.url === serverUrl);

        if (!server) {
            throw new Error(`Server ${serverUrl} not found for type ${type}`);
        }

        try {
            return await server.queue.add(
                async () => {
                    server.totalRequests++;
                    try {
                        const response = await fetch(
                            `${serverUrl}/generate`,
                            options,
                        );
                        if (!response.ok) {
                            server.errors++;

                            // Capture detailed error information
                            let errorBody = "";
                            try {
                                errorBody = await response.text();
                            } catch (e) {
                                errorBody =
                                    "Could not read error response body";
                            }

                            console.error(
                                `[${type}] Server ${serverUrl} returned ${response.status}:`,
                                {
                                    status: response.status,
                                    statusText: response.statusText,
                                    headers: Object.fromEntries(
                                        response.headers.entries(),
                                    ),
                                    body: errorBody.substring(0, 500), // Limit to first 500 chars
                                },
                            );

                            throw new Error(
                                `HTTP error! status: ${response.status}, body: ${errorBody.substring(0, 200)}`,
                            );
                        }
                        return response;
                    } catch (error) {
                        server.errors++;
                        throw error;
                    }
                },
                {
                    // throw on timeout instead of quitely resolving to void
                    // please check if this causes any issues @voodoohop
                    throwOnTimeout: true,
                },
            );
        } catch (error) {
            lastError = error as Error;

            // Only retry on 500 errors
            if (error.message && error.message.includes("status: 500")) {
                console.error(
                    `[${type}] Attempt ${attempt + 1}/${maxRetries} failed with 500 error, trying different server...`,
                );
                continue;
            }

            // For non-500 errors, throw immediately
            throw error;
        }
    }

    // If we exhausted all retries, throw the last error
    throw lastError || new Error("All server attempts failed");
};

// Wrapper for backward compatibility
export const fetchFromLeastBusyFluxServer = (options: RequestInit) =>
    fetchFromLeastBusyServer("flux", options);
