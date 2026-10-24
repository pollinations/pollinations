// Upstream's checkpoint-store.ts at the same commit (MIT), with its Redis store
// ported to Workers KV. The file, memory and Vercel stores are not needed here.

/** Maximum serialized checkpoint size (5 MB). */
const MAX_CHECKPOINT_BYTES = 5 * 1024 * 1024;

const KV_TTL_SECONDS = 30 * 24 * 60 * 60;

/**
 * Validates that a checkpoint ID is safe to use as a filename.
 * Rejects path traversal attempts and other filesystem-unsafe characters.
 */
function validateCheckpointId(id: string): void {
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
        throw new Error(
            `Invalid checkpoint id: must be alphanumeric, hyphens, or underscores`,
        );
    }
    if (id.length > 64) {
        throw new Error(`Invalid checkpoint id: exceeds 64 character limit`);
    }
}

export interface CheckpointStore {
    save(id: string, data: { elements: any[] }): Promise<void>;
    load(id: string): Promise<{ elements: any[] } | null>;
}

export function kvCheckpointStore(kv: KVNamespace): CheckpointStore {
    return {
        async save(id, data) {
            validateCheckpointId(id);
            const serialized = JSON.stringify(data);
            if (serialized.length > MAX_CHECKPOINT_BYTES) {
                throw new Error(
                    `Checkpoint data exceeds ${MAX_CHECKPOINT_BYTES} byte limit`,
                );
            }
            await kv.put(`cp:${id}`, serialized, {
                expirationTtl: KV_TTL_SECONDS,
            });
        },
        async load(id) {
            validateCheckpointId(id);
            return kv.get(`cp:${id}`, "json");
        },
    };
}
