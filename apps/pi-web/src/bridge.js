// Host side of the fetch bridge.
//
// The sandbox runs with network disabled, so Pi cannot reach the internet on
// its own. Guest code leaves request envelopes in /workspace/.bridge and this
// loop answers them from the trusted page, where the visitor's Pollen key
// lives. The key is only ever attached to requests for GEN_BASE_URL.

import { GUEST } from "./piConfig.js";

const ALLOWED_HOST = "gen.pollinations.ai";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function toBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(binary);
}

function fromBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

/**
 * Replay a guest request on the trusted side.
 * Only gen.pollinations.ai is ever contacted; anything else is refused so a
 * misbehaving guest cannot use the page as an open proxy.
 */
export async function forwardRequest(request, apiKey) {
    const url = new URL(request.url);
    if (url.hostname !== ALLOWED_HOST) {
        throw new Error(`pi-web refuses to proxy ${url.hostname}`);
    }
    const headers = { ...(request.headers ?? {}) };
    for (const name of Object.keys(headers)) {
        if (name.toLowerCase() === "authorization") delete headers[name];
    }
    headers.authorization = `Bearer ${apiKey}`;

    const response = await fetch(url.toString(), {
        method: request.method ?? "POST",
        headers,
        body: request.body ?? undefined,
    });
    const buffer = await response.arrayBuffer();
    return {
        status: response.status,
        headers: {
            "content-type": response.headers.get("content-type") ?? "application/json",
        },
        body: toBase64(buffer),
    };
}

/**
 * Watch the guest mailbox and answer envelopes until stopped.
 * `onEvent` receives progress reports for the UI; it never sees the key.
 */
export function createBridge({ sandbox, getApiKey, onEvent = () => {}, pollMs = 120 }) {
    let stopped = false;
    const handled = new Set();
    let inFlight = 0;

    async function answer(name) {
        const id = name.replace(/\.req$/, "");
        const requestPath = `${GUEST.bridgeDir}/${name}`;
        let request;
        try {
            request = JSON.parse(await sandbox.fs.readText(requestPath));
        } catch (error) {
            onEvent({ type: "bridge-error", id, message: String(error) });
            await sandbox.fs.remove(requestPath).catch(() => {});
            return;
        }
        // Remove the envelope straight away so a slow poll cannot pick it up twice.
        await sandbox.fs.remove(requestPath).catch(() => {});

        onEvent({ type: "request", id, url: request.url, method: request.method });

        inFlight += 1;
        let reply;
        try {
            reply = await forwardRequest(request, getApiKey());
        } catch (error) {
            reply = {
                status: 502,
                headers: { "content-type": "application/json" },
                body: toBase64(new TextEncoder().encode(JSON.stringify({ error: String(error) }))),
            };
        } finally {
            inFlight -= 1;
        }

        onEvent({ type: "response", id, status: reply.status });
        await sandbox.fs.writeText(
            `${GUEST.bridgeDir}/${id}.resp`,
            JSON.stringify(reply),
        );
    }

    async function loop() {
        while (!stopped) {
            let entries = [];
            try {
                entries = await sandbox.fs.readDir(GUEST.bridgeDir);
            } catch {
                await sleep(pollMs);
                continue;
            }
            for (const entry of entries) {
                if (!entry.name.endsWith(".req") || handled.has(entry.name)) continue;
                handled.add(entry.name);
                void answer(entry.name);
            }
            await sleep(pollMs);
        }
    }

    const running = loop();

    return {
        get pending() {
            return inFlight;
        },
        async stop() {
            stopped = true;
            await running;
        },
    };
}

export { fromBase64, toBase64 };
