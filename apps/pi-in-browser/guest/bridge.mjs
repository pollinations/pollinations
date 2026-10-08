// Pi extension: bridges the provider's HTTP traffic to the host page with
// LIVE token streaming.
//
// The sandbox has no network ("disabled"). This shim replaces
// globalThis.fetch: every request is serialized to
// /workspace/.bridge/<uuid>.req. The host forwards it to
// gen.pollinations.ai on the trusted side (allowlisted, authenticated with
// the real key, which never enters the guest) and streams the answer back
// through the pump process as:
//   <id>.head  - JSON { status, statusText, headers } once headers arrive
//   <id>.body  - raw response bytes, appended as they stream in
//   <id>.done  - JSON { error?: string } when the response is complete
//
// fetch() resolves as soon as .head lands and hands Pi a Response whose
// body is a ReadableStream, so tokens reach the terminal as they are
// generated instead of after the full response is buffered.

import crypto from "node:crypto";
import fs from "node:fs";

const DIR = "/workspace/.bridge";
const POLL_MS = 60;
const HEAD_TIMEOUT_MS = 120000;
const BODY_IDLE_TIMEOUT_MS = 120000;

function readJson(path) {
    try {
        return JSON.parse(fs.readFileSync(path, "utf8"));
    } catch {
        return null;
    }
}

function exists(path) {
    try {
        fs.statSync(path);
        return true;
    } catch {
        return false;
    }
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Follows <id>.body for appended bytes, emitting each new tail via
// emit(newBytes). Completes via onComplete() once <id>.done appears (with
// no unread tail left), throws on bridge errors or idle timeout.
async function followBody(id, emit, onComplete) {
    const bodyPath = `${DIR}/${id}.body`;
    const donePath = `${DIR}/${id}.done`;
    let offset = 0;
    let lastActivity = Date.now();
    for (;;) {
        if (exists(bodyPath)) {
            let buf = null;
            try {
                buf = fs.readFileSync(bodyPath);
            } catch {}
            if (buf && buf.length > offset) {
                emit(new Uint8Array(buf.subarray(offset)));
                offset = buf.length;
                lastActivity = Date.now();
                continue; // re-check for more bytes before honoring done
            }
        }
        const done = readJson(donePath);
        if (done) {
            if (done.error) throw new Error(`bridge: ${done.error}`);
            try {
                fs.unlinkSync(bodyPath);
                fs.unlinkSync(donePath);
                fs.unlinkSync(`${DIR}/${id}.head`);
                fs.unlinkSync(`${DIR}/${id}.req`);
            } catch {}
            onComplete();
            return;
        }
        if (Date.now() - lastActivity > BODY_IDLE_TIMEOUT_MS) {
            throw new Error("bridge: body stream idle timeout");
        }
        await sleep(POLL_MS);
    }
}

function makeBodyStream(id) {
    if (typeof ReadableStream === "function") {
        return new ReadableStream({
            async start(controller) {
                try {
                    await followBody(
                        id,
                        (chunk) => controller.enqueue(chunk),
                        () => controller.close(),
                    );
                } catch (err) {
                    try {
                        controller.error(err);
                    } catch {}
                }
            },
        });
    }
    // Minimal reader fallback for runtimes without ReadableStream:
    // exposes getReader() and async iteration over the same file tail.
    const reader = {
        read: () =>
            new Promise((resolve, reject) => {
                followBody(
                    id,
                    (chunk) => {
                        resolve({ value: chunk, done: false });
                    },
                    () => resolve({ value: undefined, done: true }),
                ).catch(reject);
            }),
    };
    return {
        getReader: () => reader,
        [Symbol.asyncIterator]: async function* () {
            for (;;) {
                const { value, done } = await reader.read();
                if (done) return;
                yield value;
            }
        },
    };
}

export default function bridgeExtension(pi) {
    fs.mkdirSync(DIR, { recursive: true });

    globalThis.fetch = async (url, opts = {}) => {
        const id = crypto.randomUUID();
        const envelope = {
            id,
            url: String(url),
            method: opts.method === "POST" ? "POST" : "GET",
            headers: {},
            body: opts.body == null ? null : String(opts.body),
        };
        // Keep routing headers (content type), but never credentials:
        // the guest only ever holds the dummy key and the host injects
        // the real Authorization header on the trusted side.
        const headers = opts.headers;
        if (headers && typeof headers.forEach === "function") {
            headers.forEach((value, key) => {
                if (key.toLowerCase() === "authorization") return;
                envelope.headers[key] = String(value);
            });
        } else if (headers && typeof headers === "object") {
            for (const [key, value] of Object.entries(headers)) {
                if (key.toLowerCase() === "authorization") continue;
                envelope.headers[key] = String(value);
            }
        }
        const tmp = `${DIR}/${id}.req.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(envelope));
        fs.renameSync(tmp, `${DIR}/${id}.req`);

        const headPath = `${DIR}/${id}.head`;
        const deadline = Date.now() + HEAD_TIMEOUT_MS;
        while (Date.now() < deadline) {
            const head = readJson(headPath);
            if (head) {
                return new Response(makeBodyStream(id), {
                    status: head.status,
                    statusText: head.statusText ?? "",
                    headers: head.headers ?? {},
                });
            }
            const early = readJson(`${DIR}/${id}.done`);
            if (early?.error) {
                throw new Error(`bridge: ${early.error}`);
            }
            await sleep(POLL_MS);
        }
        throw new Error(`bridge: timed out waiting for response head`);
    };

    pi.on("session_start", () => {
        console.error("[pi-in-browser] streaming bridge active");
    });
}
