// Guest-side bridge pump: a dedicated process inside the sandbox whose
// only job is the bounded guest<->host transport. It streams request
// envelopes to the host as length-prefixed frames
// ([4-byte BE length][JSON]) on stdout, and applies response frames from
// its stdin to /workspace/.bridge files:
//   {type:"head",  id, status, statusText, headers}
//   {type:"chunk", id, b64}                  (appended to <id>.body)
//   {type:"end",   id, error?}                (writes <id>.done)
// Everything is capped (fail closed) and ids are re-validated with the
// same strict pattern the host enforces, so a compromised guest cannot
// smuggle writes outside the bridge directory or beyond the caps.

import fs from "node:fs";
import path from "node:path";

const DIR = "/workspace/.bridge";
const REQ_CAP = 4 * 1024 * 1024 + 1024;
const BODY_CAP = 32 * 1024 * 1024;
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

fs.mkdirSync(DIR, { recursive: true });

function sendFrame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), "utf8");
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length, 0);
    process.stdout.write(Buffer.concat([head, payload]));
}

const seen = new Set();
function pollRequests() {
    let names;
    try {
        names = fs.readdirSync(DIR);
    } catch {
        return;
    }
    for (const name of [...seen]) {
        if (!names.includes(name)) seen.delete(name);
    }
    for (const name of names) {
        if (!name.endsWith(".req") || seen.has(name)) continue;
        seen.add(name);
        const full = path.join(DIR, name);
        try {
            const st = fs.statSync(full);
            if (st.size > REQ_CAP) {
                sendFrame({ type: "oversize", id: name.slice(0, -4) });
                continue;
            }
            const envelope = JSON.parse(fs.readFileSync(full, "utf8"));
            if (!ID_RE.test(envelope.id ?? "")) {
                sendFrame({ type: "invalid", id: name.slice(0, -4) });
                continue;
            }
            sendFrame({ type: "request", envelope });
        } catch (err) {
            sendFrame({
                type: "invalid",
                id: name.slice(0, -4),
                reason: String(err?.message ?? err),
            });
        }
    }
}
setInterval(pollRequests, 100);

const bodySizes = new Map();
function applyFrame(frame) {
    if (!frame || typeof frame.id !== "string" || !ID_RE.test(frame.id)) {
        return; // fail closed on malformed frames
    }
    const id = frame.id;
    if (frame.type === "head") {
        fs.writeFileSync(
            `${DIR}/${id}.head.tmp`,
            JSON.stringify({
                status: Number(frame.status) || 502,
                statusText: String(frame.statusText ?? ""),
                headers:
                    frame.headers && typeof frame.headers === "object"
                        ? frame.headers
                        : {},
            }),
        );
        fs.renameSync(`${DIR}/${id}.head.tmp`, `${DIR}/${id}.head`);
    } else if (frame.type === "chunk") {
        const current = bodySizes.get(id) ?? 0;
        if (current >= BODY_CAP) return; // already capped
        const bytes = Buffer.from(String(frame.b64 ?? ""), "base64");
        if (bytes.length === 0) return;
        if (current + bytes.length > BODY_CAP) {
            bodySizes.set(id, BODY_CAP);
            fs.writeFileSync(
                `${DIR}/${id}.done.tmp`,
                JSON.stringify({ error: "response exceeded size cap" }),
            );
            fs.renameSync(`${DIR}/${id}.done.tmp`, `${DIR}/${id}.done`);
            return;
        }
        fs.appendFileSync(`${DIR}/${id}.body`, bytes);
        bodySizes.set(id, current + bytes.length);
    } else if (frame.type === "end") {
        bodySizes.delete(id);
        try {
            fs.unlinkSync(`${DIR}/${id}.req`);
        } catch {}
        fs.writeFileSync(
            `${DIR}/${id}.done.tmp`,
            JSON.stringify({
                error: frame.error
                    ? String(frame.error).slice(0, 500)
                    : undefined,
            }),
        );
        fs.renameSync(`${DIR}/${id}.done.tmp`, `${DIR}/${id}.done`);
    }
}

let stdinBuf = Buffer.alloc(0);
process.stdin.on("data", (chunk) => {
    stdinBuf = Buffer.concat([stdinBuf, chunk]);
    if (stdinBuf.length > REQ_CAP) {
        process.exit(1); // trusted side misbehaving: die, fail closed
    }
    for (;;) {
        if (stdinBuf.length < 4) return;
        const len = stdinBuf.readUInt32BE(0);
        if (len > REQ_CAP) {
            process.exit(1);
        }
        if (stdinBuf.length < 4 + len) return;
        const payload = stdinBuf.subarray(4, 4 + len).toString("utf8");
        stdinBuf = stdinBuf.subarray(4 + len);
        try {
            applyFrame(JSON.parse(payload));
        } catch {}
    }
});
