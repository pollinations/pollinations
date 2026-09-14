import type { GenerationRequestSnapshot } from "@/middleware/generation-deduplication.ts";

const BODY_KEY_PREFIX = "body:";
const BODY_CHUNK_BYTES = 1_000_000;

export type PersistedGenerationRequest = {
    request: Omit<GenerationRequestSnapshot, "body">;
    bodyChunks: number;
};

export function bodyChunkKeys(count: number): string[] {
    return Array.from(
        { length: count },
        (_, index) => `${BODY_KEY_PREFIX}${index}`,
    );
}

export async function persistRequest(
    storage: DurableObjectStorage,
    snapshot: GenerationRequestSnapshot,
): Promise<PersistedGenerationRequest> {
    const body = snapshot.body;
    const chunks: Uint8Array[] = [];
    if (body !== undefined) {
        const bytes = body;
        for (let offset = 0; offset < bytes.byteLength; ) {
            const end = Math.min(offset + BODY_CHUNK_BYTES, bytes.byteLength);
            chunks.push(bytes.slice(offset, end));
            offset = end;
        }
    }

    const { body: _body, ...request } = snapshot;
    const entries: Record<string, unknown> = {};
    for (const [index, chunk] of chunks.entries()) {
        entries[`${BODY_KEY_PREFIX}${index}`] = chunk;
    }
    await storage.put(entries);
    return { request, bodyChunks: chunks.length };
}

export async function restoreRequest(
    storage: DurableObjectStorage,
    job: PersistedGenerationRequest,
): Promise<GenerationRequestSnapshot> {
    let body: Uint8Array | undefined;
    if (job.bodyChunks > 0) {
        const keys = bodyChunkKeys(job.bodyChunks);
        const storedChunks = await storage.get<Uint8Array>(keys);
        const chunks = keys.map((key) => storedChunks.get(key));
        if (chunks.some((chunk) => chunk === undefined)) {
            throw new Error("Persisted generation request is incomplete");
        }
        const size = chunks.reduce(
            (total, chunk) => total + (chunk?.byteLength ?? 0),
            0,
        );
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            if (!chunk) {
                throw new Error("Persisted generation request is incomplete");
            }
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        body = bytes;
    }
    return { ...job.request, ...(body !== undefined && { body }) };
}
