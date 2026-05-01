import debug from "debug";

const logServer = debug("pollinations:server");

export type ServerType = "flux" | "translate" | "zimage";

type ServerEntry = {
    url: string;
    lastHeartbeat: number;
};

const SERVER_TIMEOUT = 45000;
const REGISTRY_TTL_SECONDS = 60;
const VALID_TYPES = new Set<ServerType>(["flux", "translate", "zimage"]);

let serverRegistry: KVNamespace | null = null;
let registryEnvironment = "development";

export function setServerRegistryBinding(
    binding: KVNamespace,
    environment = "development",
): void {
    serverRegistry = binding;
    registryEnvironment = environment;
}

function getServerRegistry(): KVNamespace {
    if (!serverRegistry) {
        throw new Error("Image server registry is not configured");
    }
    return serverRegistry;
}

function normalizeType(type: string): ServerType {
    if (VALID_TYPES.has(type as ServerType)) return type as ServerType;
    logServer(`Unknown server type "${type}", defaulting to "flux"`);
    return "flux";
}

function kvKey(type: ServerType): string {
    return `image:servers:${registryEnvironment}:${type}`;
}

export const registerServer = async (
    url: string,
    type: ServerType = "flux",
): Promise<void> => {
    type = normalizeType(type);
    const kv = getServerRegistry();
    const now = Date.now();
    const raw = await kv.get(kvKey(type));
    const servers: ServerEntry[] = raw ? JSON.parse(raw) : [];
    const activeServers = servers.filter(
        (server) => now - server.lastHeartbeat < SERVER_TIMEOUT,
    );
    const existingServer = activeServers.find((server) => server.url === url);

    if (existingServer) {
        existingServer.lastHeartbeat = now;
        logServer(`Updated heartbeat for ${type} server ${url}`);
    } else {
        activeServers.push({ url, lastHeartbeat: now });
        logServer(`Registered new ${type} server ${url}`);
    }

    await kv.put(kvKey(type), JSON.stringify(activeServers), {
        expirationTtl: REGISTRY_TTL_SECONDS,
    });
};

export async function getRegisteredServers(
    type: ServerType = "flux",
): Promise<ServerEntry[]> {
    type = normalizeType(type);
    const raw = await getServerRegistry().get(kvKey(type));
    if (!raw) return [];

    const now = Date.now();
    const servers = JSON.parse(raw) as ServerEntry[];
    return servers.filter(
        (server) => now - server.lastHeartbeat < SERVER_TIMEOUT,
    );
}

export async function countJobs(type: ServerType = "flux"): Promise<number> {
    return (await getRegisteredServers(type)).length;
}

export const countFluxJobs = () => countJobs("flux");

export const getNextServerUrl = async (
    type: ServerType = "flux",
): Promise<string> => {
    const activeServers = await getRegisteredServers(type);
    if (activeServers.length === 0) {
        throw new Error(`No active ${type} servers available`);
    }
    return activeServers[Math.floor(Math.random() * activeServers.length)].url;
};

export const getNextTranslationServerUrl = () => getNextServerUrl("translate");

export const fetchFromLeastBusyServer = async (
    type: ServerType = "flux",
    options: RequestInit,
): Promise<Response> => {
    const maxRetries = 3;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
        const serverUrl = await getNextServerUrl(type);

        try {
            const response = await fetch(`${serverUrl}/generate`, options);
            if (!response.ok) {
                let errorBody = "";
                try {
                    errorBody = await response.text();
                } catch {
                    errorBody = "Could not read error response body";
                }

                console.error(
                    `[${type}] Server ${serverUrl} returned ${response.status}:`,
                    {
                        status: response.status,
                        statusText: response.statusText,
                        body: errorBody.substring(0, 500),
                    },
                );

                throw new Error(
                    `HTTP error! status: ${response.status}, body: ${errorBody.substring(0, 200)}`,
                );
            }
            return response;
        } catch (error) {
            lastError = error as Error;

            if ((error as Error).message?.includes("status: 500")) {
                console.error(
                    `[${type}] Attempt ${attempt + 1}/${maxRetries} failed with 500 error, trying different server...`,
                );
                continue;
            }

            throw error;
        }
    }

    throw lastError || new Error("All server attempts failed");
};

export const fetchFromLeastBusyFluxServer = (options: RequestInit) =>
    fetchFromLeastBusyServer("flux", options);
