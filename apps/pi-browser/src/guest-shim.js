/**
 * Runs INSIDE the sandbox, injected with `NODE_OPTIONS=--import=…bridge.mjs`.
 *
 * A browser sandbox cannot open outbound TCP, so Pi's model calls are handed
 * to the host page instead: the shim serialises each `fetch` into a pending
 * file, the page answers it with the visitor's own key, and the shim returns
 * the buffered response. Credentials never enter the guest — auth.json holds
 * only a placeholder — and the guest needs no WISP relay or other network
 * plumbing.
 *
 * The guest runtime (a WASIX Node-compatible edge runtime) does not expose
 * every web global as a constructor, so `Request`/`Headers`/`Response` are
 * feature-detected instead of assumed.
 *
 * Limitations: responses are buffered (no incremental streaming), and `bash`
 * commands that need the internet have no route out.
 */
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

const ROOT = "/workspace/.bridge";
const PENDING = `${ROOT}/pending`;
const DONE = `${ROOT}/done`;
mkdirSync(PENDING, { recursive: true });
mkdirSync(DONE, { recursive: true });
// Diagnostics for the host: which process loaded the shim, and any failure.
try {
    writeFileSync(
        `${ROOT}/loaded.txt`,
        JSON.stringify({
            version: process.version,
            argv: process.argv.slice(0, 4),
            nodeOptions: process.env.NODE_OPTIONS ?? null,
            at: new Date().toISOString(),
        }),
    );
} catch {}

// Marker so the page can tell the shim is loaded (String(fetch) is minified
// and unreliable), plus a readable id source.
globalThis.__piBridge = { version: 2, root: ROOT };

let idCounter = 0;
// NOT node:crypto's randomUUID: this guest runtime's randomFillSync is
// broken ("job.run is not a function"), which killed every bridged request.
function newId() {
    idCounter += 1;
    return `${Date.now().toString(36)}-${idCounter.toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const isConstructor = (name) => typeof globalThis[name] === "function";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeHeaders(source) {
    if (!source) return {};
    if (isConstructor("Headers") && source instanceof Headers) {
        return Object.fromEntries(
            [...source.entries()].map(([name, value]) => [
                String(name).toLowerCase(),
                String(value),
            ]),
        );
    }
    const entries = Array.isArray(source)
        ? source
        : typeof source.entries === "function"
          ? [...source.entries()]
          : Object.entries(source);
    return Object.fromEntries(
        entries.map(([name, value]) => [
            String(name).toLowerCase(),
            String(value),
        ]),
    );
}

function isRequestLike(value) {
    return (
        value !== null &&
        typeof value === "object" &&
        typeof value.url === "string"
    );
}

async function bodyOf(input, init) {
    const body = init?.body;
    if (body !== undefined && body !== null) {
        if (typeof body === "string") return body;
        if (isConstructor("Response")) {
            try {
                return await new Response(body).text();
            } catch {}
        }
        return String(body);
    }
    if (isRequestLike(input)) {
        try {
            if (typeof input.clone === "function") {
                return await input.clone().text();
            }
            if (typeof input.text === "function") {
                return await input.text();
            }
        } catch {}
    }
    return null;
}

// Runtime-level breadcrumbs: did anything call fetch, and did the process
// die with an error our wrapper never saw?
function trace(line) {
    try {
        writeFileSync(`${ROOT}/calls.log`, `${line}\n`, { flag: "a" });
    } catch {}
}
try {
    process.on("uncaughtException", (error) =>
        trace(`uncaught ${String(error?.stack ?? error)}`),
    );
    process.on("unhandledRejection", (error) =>
        trace(`unhandled ${String(error?.stack ?? error)}`),
    );
} catch {}

const bridgedFetchFn = async (input, init = {}) => {
    const url =
        typeof input === "string"
            ? input
            : isRequestLike(input)
              ? input.url
              : String(input);
    trace(
        `call ${init?.method ?? (isRequestLike(input) ? input.method : "GET")} ${url}`,
    );
    // Pi's install/version telemetry to pi.dev has no route out of the
    // sandbox and is not part of the model path — answer it locally so it
    // never enters the queue or the host log.
    if (url.startsWith("https://pi.dev/") && isConstructor("Response")) {
        return new Response(JSON.stringify({}), {
            status: 404,
            headers: { "content-type": "application/json" },
        });
    }
    try {
        return await bridgedFetch(input, init);
    } catch (error) {
        try {
            writeFileSync(
                `${ROOT}/error.txt`,
                `${new Date().toISOString()} ${String(error?.stack ?? error)}\n`,
                { flag: "a" },
            );
        } catch {}
        throw error;
    }
};

/**
 * Pi's bundle installs its own bundled undici at startup
 * (`globalThis.fetch = undici.fetch`), which would silently replace this
 * shim and then fail — the sandbox has no raw TCP. Define fetch as an
 * accessor that always yields the bridge: undici's assignment lands in the
 * setter, and every *read* still gets back the bridged function. A poller
 * restores the accessor if anything defines the property outright.
 */
function exposeFetch() {
    Object.defineProperty(globalThis, "fetch", {
        configurable: true,
        enumerable: true,
        get: () => bridgedFetchFn,
        set: () => {
            // Discarded on purpose: guests have no other route out anyway.
            trace("blocked foreign fetch install");
        },
    });
}
try {
    exposeFetch();
    const timer = setInterval(() => {
        try {
            if (globalThis.fetch !== bridgedFetchFn) exposeFetch();
        } catch {}
    }, 50);
    // Do not hold the process open just for the guard.
    timer.unref?.();
} catch {}

async function bridgedFetch(input, init) {
    const url =
        typeof input === "string"
            ? input
            : isRequestLike(input)
              ? input.url
              : String(input);
    const method =
        init.method ??
        (isRequestLike(input) && input.method ? input.method : "GET");
    const id = newId();
    const request = {
        url,
        method,
        headers: normalizeHeaders(init.headers ?? input?.headers),
        body: await bodyOf(input, init),
    };
    writeFileSync(`${PENDING}/${id}.json`, JSON.stringify(request));

    const deadline = Date.now() + 180_000;
    for (;;) {
        let raw;
        try {
            raw = readFileSync(`${DONE}/${id}.json`, "utf8");
        } catch (error) {
            if (error?.code !== "ENOENT") throw error;
            if (Date.now() > deadline) {
                throw new Error(`Pi bridge timed out: ${method} ${url}`);
            }
            await sleep(30);
            continue;
        }
        try {
            unlinkSync(`${DONE}/${id}.json`);
        } catch {}
        try {
            unlinkSync(`${PENDING}/${id}.json`);
        } catch {}

        const payload = JSON.parse(raw);
        if (payload.error) throw new Error(payload.error);
        if (!isConstructor("Response")) {
            throw new Error("guest runtime has no Response constructor");
        }
        return new Response(decodeBase64(payload.body ?? ""), {
            status: payload.status,
            headers: payload.headers,
        });
    }
}

function decodeBase64(text) {
    const binary = atob(text);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) {
        bytes[index] = binary.charCodeAt(index);
    }
    return bytes;
}
