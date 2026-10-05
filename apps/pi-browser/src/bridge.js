/**
 * The host half of the sandbox bridge: drain the guest's pending requests,
 * forward them from the page with the visitor's own Pollinations key, and
 * write the answers back for the guest shim (guest-shim.js) to pick up.
 */

export const BRIDGE_DIR = "/workspace/.bridge";
/** What auth.json inside the guest contains; the host swaps in the real key. */
export const KEY_PLACEHOLDER = "pollinations-bridge-key";

/** `readDir` may return plain names or entries; normalise to names. */
export function normalizeEntries(entries) {
    return (entries ?? [])
        .map((entry) => (typeof entry === "string" ? entry : entry?.name))
        .filter((name) => typeof name === "string" && name.endsWith(".json"));
}

/**
 * Build the page-side request. Requests to the gateway always carry the
 * visitor's key; any placeholder Pi read from auth.json is replaced too, so
 * the key never has to exist inside the guest.
 */
export function buildForward(request, { key, genOrigin }) {
    const headers = { ...request.headers };
    delete headers.host;
    delete headers.cookie;
    delete headers["content-length"];

    const target = new URL(request.url);
    if (target.origin === genOrigin && key) {
        headers.authorization = `Bearer ${key}`;
    }
    for (const [name, value] of Object.entries(headers)) {
        if (typeof value === "string" && value.includes(KEY_PLACEHOLDER)) {
            if (!key) {
                // Guest tier: no key pasted — drop the placeholder entirely
                // (the gateway rejects a bearer it does not recognise).
                delete headers[name];
                continue;
            }
            headers[name] = value.split(KEY_PLACEHOLDER).join(key);
        }
    }

    return {
        url: request.url,
        method: request.method || "GET",
        headers,
        body: request.body ?? undefined,
    };
}

/** Chunked base64 so a multi-megabyte body does not blow the argument limit. */
export function toBase64(bytes) {
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
        binary += String.fromCharCode(
            ...bytes.subarray(offset, offset + 0x8000),
        );
    }
    return btoa(binary);
}

export function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}

export async function encodeResponse(response) {
    const body = new Uint8Array(await response.arrayBuffer());
    return {
        status: response.status,
        headers: Object.fromEntries(response.headers.entries()),
        body: toBase64(body),
    };
}

function errorPayload(error) {
    return {
        error: String(error?.message ?? error),
    };
}

/**
 * One pass over the pending directory. `handled` remembers names already
 * answered so a guest that has not unlinked its file yet is not forwarded
 * twice.
 */
export async function pumpBridge({
    fs,
    key,
    genOrigin,
    fetchImpl = fetch,
    handled = new Set(),
    onEvent,
    maxBatch = 8,
}) {
    let entries;
    try {
        entries = await fs.readDir(`${BRIDGE_DIR}/pending`);
    } catch {
        // The guest creates the queue on its first request.
        return 0;
    }
    const names = normalizeEntries(entries).filter(
        (name) => !handled.has(name),
    );
    const batch = names.slice(0, maxBatch);
    for (const name of batch) {
        handled.add(name);
        let payload;
        let request;
        try {
            request = JSON.parse(
                await fs.readText(`${BRIDGE_DIR}/pending/${name}`),
            );
            const forward = buildForward(request, { key, genOrigin });
            const response = await fetchImpl(forward.url, {
                method: forward.method,
                headers: forward.headers,
                body: forward.body,
            });
            payload = await encodeResponse(response);
            onEvent?.({
                name,
                method: forward.method,
                url: forward.url,
                status: payload.status,
            });
        } catch (error) {
            payload = errorPayload(error);
            onEvent?.({
                name,
                method: request?.method ?? "?",
                url: request?.url ?? String(error?.message ?? error),
                status: 0,
                error: true,
            });
        }
        await fs.writeText(
            `${BRIDGE_DIR}/done/${name}`,
            JSON.stringify(payload),
        );
    }
    return batch.length;
}

/** Run `pumpBridge` until `signal` aborts (or the sandbox goes away). */
export async function pumpLoop(options) {
    const { intervalMs = 120, signal, onLoopError } = options;
    while (!signal?.aborted) {
        try {
            await pumpBridge(options);
        } catch (error) {
            onLoopError?.(error);
        }
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
}
