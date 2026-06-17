import debug from "debug";
import { HttpError } from "./httpError.ts";

const logServer = debug("pollinations:server");

export const VALID_TYPES = ["flux", "zimage", "sana", "ltx2"] as const;
export type ServerType = (typeof VALID_TYPES)[number];

type ServerEntry = {
    url: string;
    lastHeartbeat: number;
    // Last observed /generate latency (ms), measured by the gen worker. Used to
    // weight load balancing toward faster backends so a slow GPU (e.g. a 3090
    // next to a 4090) does not get an equal share and drown. Absent until the
    // first request to that server has completed.
    lastMs?: number;
};

const SERVER_TIMEOUT = 180000;
const REGISTRY_TTL_SECONDS = 240;
const REGISTRY_WRITE_THROTTLE_MS = 30_000;
// Persist a server's latest latency at most this often (KV ~1 write/sec/key).
const LATENCY_WRITE_THROTTLE_MS = 20_000;
// Latency assumed for a server with no measurement yet, so it still gets
// sampled (not starved or flooded) on cold start.
const DEFAULT_LATENCY_MS = 8000;

let serverRegistry: KVNamespace | null = null;
let registryEnvironment = "development";
const recentWrites = new Map<string, number>();
const recentLatencyWrites = new Map<string, number>();

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

export function isValidType(type: string): type is ServerType {
    return (VALID_TYPES as readonly string[]).includes(type);
}

function prefix(type: ServerType): string {
    return `image:server:${registryEnvironment}:${type}:`;
}

async function urlHash(url: string): Promise<string> {
    const data = new TextEncoder().encode(url);
    const digest = await crypto.subtle.digest("SHA-1", data);
    const bytes = new Uint8Array(digest);
    let hex = "";
    for (let i = 0; i < bytes.length; i++) {
        hex += bytes[i].toString(16).padStart(2, "0");
    }
    return hex;
}

export const registerServer = async (
    url: string,
    type: ServerType,
): Promise<void> => {
    const kv = getServerRegistry();
    const key = prefix(type) + (await urlHash(url));
    const now = Date.now();
    const lastWrite = recentWrites.get(key);
    if (
        lastWrite !== undefined &&
        now - lastWrite < REGISTRY_WRITE_THROTTLE_MS
    ) {
        logServer(`Skipped throttled write for ${type} server ${url}`);
        return;
    }
    // Preserve any latency previously recorded by recordLatency() so a heartbeat
    // write does not wipe the routing weight.
    const existing = await kv.get<ServerEntry>(key, "json");
    const entry: ServerEntry = {
        url,
        lastHeartbeat: now,
        ...(existing?.lastMs !== undefined && { lastMs: existing.lastMs }),
    };
    await kv.put(key, JSON.stringify(entry), {
        expirationTtl: REGISTRY_TTL_SECONDS,
    });
    recentWrites.set(key, now);
    logServer(`Registered ${type} server ${url}`);
};

export async function getRegisteredServers(
    type: ServerType,
): Promise<ServerEntry[]> {
    const kv = getServerRegistry();
    const { keys } = await kv.list({ prefix: prefix(type) });
    if (keys.length === 0) return [];

    const now = Date.now();
    const entries = await Promise.all(
        keys.map((k) => kv.get<ServerEntry>(k.name, "json")),
    );
    return entries.filter(
        (e): e is ServerEntry =>
            e !== null && now - e.lastHeartbeat < SERVER_TIMEOUT,
    );
}

// Weighted-random pick over active servers, weighted by 1/lastMs so faster
// backends receive proportionally more traffic (a 3090 next to a 4090 gets a
// smaller share instead of an equal one). Weighted rather than always-pick-the-
// fastest to avoid herding every request onto one server between updates.
// Unmeasured servers use a neutral default so they still get sampled. Pure
// function — exported for testing.
export function chooseWeightedServer(servers: ServerEntry[]): string {
    if (servers.length === 1) return servers[0].url;
    const weights = servers.map((s) => 1 / (s.lastMs ?? DEFAULT_LATENCY_MS));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < servers.length; i++) {
        r -= weights[i];
        if (r <= 0) return servers[i].url;
    }
    return servers[servers.length - 1].url;
}

export const getNextServerUrl = async (
    type: ServerType = "flux",
): Promise<string> => {
    const activeServers = await getRegisteredServers(type);
    if (activeServers.length === 0) {
        throw new Error(`No active ${type} servers available`);
    }
    return chooseWeightedServer(activeServers);
};

// Save the latency of the most recent successful /generate onto the server's
// registry entry, so chooseWeightedServer can weight toward faster backends.
// Throttled to one write per LATENCY_WRITE_THROTTLE_MS per server (KV caps at
// ~1 write/sec/key). Best-effort: never throws into the request path.
export const recordLatency = async (
    type: ServerType,
    url: string,
    lastMs: number,
): Promise<void> => {
    if (!serverRegistry || !Number.isFinite(lastMs) || lastMs <= 0) return;
    const key = prefix(type) + (await urlHash(url));
    const now = Date.now();
    const lastWrite = recentLatencyWrites.get(key);
    if (lastWrite !== undefined && now - lastWrite < LATENCY_WRITE_THROTTLE_MS) {
        return;
    }
    try {
        const existing = await serverRegistry.get<ServerEntry>(key, "json");
        if (!existing) return; // not registered / expired — nothing to update
        await serverRegistry.put(
            key,
            JSON.stringify({ ...existing, lastMs }),
            { expirationTtl: REGISTRY_TTL_SECONDS },
        );
        recentLatencyWrites.set(key, now);
        logServer(`Recorded latency ${lastMs}ms for ${url}`);
    } catch (err) {
        logServer(`Failed to record latency for ${url}: ${err}`);
    }
};

// Test-only: clear in-process throttle state between cases.
export function __resetLatencyStateForTests(): void {
    recentLatencyWrites.clear();
    recentWrites.clear();
}

export const fetchFromLeastBusyServer = async (
    type: ServerType = "flux",
    options: RequestInit,
): Promise<Response> => {
    const serverUrl = await getNextServerUrl(type);
    const startedAt = Date.now();
    const response = await fetch(`${serverUrl}/generate`, options);
    // Record latency for successful responses only (a 5xx/timeout would record
    // the full timeout window and wrongly down-weight a recovering server).
    if (response.ok) {
        void recordLatency(type, serverUrl, Date.now() - startedAt);
    }
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
                body: errorBody,
            },
        );

        throw new HttpError(
            `Image backend rejected request with status ${response.status}`,
            response.status,
            { body: errorBody },
            `${serverUrl}/generate`,
        );
    }
    return response;
};
