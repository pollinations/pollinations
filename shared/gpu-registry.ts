export type GpuServerEntry = {
    url: string;
    lastHeartbeat: number;
    // Last observed /generate latency, used by Gen's weighted routing.
    lastMs?: number;
};

export const gpuServerPrefix = (environment: string, type: string): string =>
    `image:server:${environment}:${type}:`;

// Separate from heartbeat writes so they cannot clobber latency samples.
export const gpuLatencyKey = (
    environment: string,
    type: string,
    hash: string,
): string => `image:latency:${environment}:${type}:${hash}`;

// Routing and monitoring must agree on which registered GPUs are live.
export async function readGpuServers(
    kv: KVNamespace,
    environment: string,
    type: string,
): Promise<GpuServerEntry[]> {
    const prefix = gpuServerPrefix(environment, type);
    const { keys } = await kv.list({ prefix });
    const now = Date.now();
    const entries = await Promise.all(
        keys.map(async (key) => {
            const entry = await kv.get<GpuServerEntry>(key.name, "json");
            if (!entry || now - entry.lastHeartbeat >= 180_000) return null;
            const hash = key.name.slice(prefix.length);
            const lastMs = await kv.get<number>(
                gpuLatencyKey(environment, type, hash),
                "json",
            );
            return lastMs != null ? { ...entry, lastMs } : entry;
        }),
    );
    return entries.filter((entry): entry is GpuServerEntry => entry !== null);
}
