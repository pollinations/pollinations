import debug from "debug";
import { HttpError } from "./httpError.ts";

const logServer = debug("pollinations:server");

export const VALID_TYPES = ["flux", "zimage", "sana", "ltx2"] as const;
export type ServerType = (typeof VALID_TYPES)[number];

type ServerEntry = {
    url: string;
    lastHeartbeat: number;
};

const SERVER_TIMEOUT = 180000;
const REGISTRY_TTL_SECONDS = 240;

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
    const entry: ServerEntry = { url, lastHeartbeat: Date.now() };
    await kv.put(key, JSON.stringify(entry), {
        expirationTtl: REGISTRY_TTL_SECONDS,
    });
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

export const fetchFromLeastBusyServer = async (
    type: ServerType = "flux",
    options: RequestInit,
): Promise<Response> => {
    const serverUrl = await getNextServerUrl(type);
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

export const fetchFromLeastBusyFluxServer = (options: RequestInit) =>
    fetchFromLeastBusyServer("flux", options);
