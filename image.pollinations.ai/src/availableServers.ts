import debug from "debug";

const logServer = debug("pollinations:server");

type ServerType = "flux" | "translate" | "zimage";

type ServerEntry = {
    url: string;
    lastHeartbeat: number;
};

const SERVER_TIMEOUT = 45000; // 45 seconds
const VALID_TYPES = new Set<string>(["flux", "translate", "zimage"]);

// Module-level KV binding reference, set once per request via middleware.
// Using any to avoid requiring @cloudflare/workers-types for a single interface.
let _kvBinding: any = null;

export function setServerRegistryBinding(binding: any): void {
    _kvBinding = binding;
}

function getKV(): any {
    if (!_kvBinding) {
        throw new Error("SERVER_REGISTRY KV binding not available");
    }
    return _kvBinding;
}

function kvKey(type: ServerType): string {
    return `servers:${type}`;
}

/**
 * Register a server or update its heartbeat in KV.
 */
export const registerServer = async (
    url: string,
    type: ServerType = "flux",
): Promise<void> => {
    if (!VALID_TYPES.has(type)) {
        logServer(`Unknown server type "${type}", defaulting to "flux"`);
        type = "flux";
    }

    const kv = getKV();
    const raw = await kv.get(kvKey(type));
    const servers: ServerEntry[] = raw ? JSON.parse(raw) : [];

    const existing = servers.find((s) => s.url === url);
    if (existing) {
        existing.lastHeartbeat = Date.now();
        logServer(`Updated heartbeat for ${type} server ${url}`);
    } else {
        servers.push({ url, lastHeartbeat: Date.now() });
        logServer(`Registered new ${type} server ${url}`);
    }

    // Write back with 60s TTL (slightly longer than heartbeat timeout).
    // Even if TTL expires, servers re-register within 45s anyway.
    await kv.put(kvKey(type), JSON.stringify(servers), { expirationTtl: 60 });
};

/**
 * Get all active servers of a given type (heartbeat within timeout).
 */
async function getActiveServers(type: ServerType): Promise<ServerEntry[]> {
    const kv = getKV();
    const raw = await kv.get(kvKey(type));
    if (!raw) return [];

    const servers: ServerEntry[] = JSON.parse(raw);
    const now = Date.now();
    return servers.filter((s) => now - s.lastHeartbeat < SERVER_TIMEOUT);
}

/**
 * Pick a random active server URL for the given type.
 */
export const getNextServerUrl = async (
    type: ServerType = "flux",
): Promise<string> => {
    const active = await getActiveServers(type);
    if (active.length === 0) {
        throw new Error(`No active ${type} servers available`);
    }
    return active[Math.floor(Math.random() * active.length)].url;
};

export const getNextTranslationServerUrl = () => getNextServerUrl("translate");

/**
 * Returns the count of active servers for a type (rough load indicator).
 */
export async function countActiveServers(
    type: ServerType = "flux",
): Promise<number> {
    const active = await getActiveServers(type);
    return active.length;
}

export function countFluxJobs(): Promise<number> {
    return countActiveServers("flux");
}

/**
 * Fetch from a random active server, retry on 500 errors.
 */
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
                    `[${type}] Attempt ${attempt + 1}/${maxRetries} failed with 500, trying another server...`,
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
