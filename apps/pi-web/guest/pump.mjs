// Guest-side bridge pump. Dedicated process inside the sandbox whose only
// job is a BOUNDED guest->host channel: it watches /workspace/.bridge for
// <id>.req files and streams them to the host as length-prefixed frames
// ([4-byte BE length][JSON]) on stdout. Files beyond the cap are never
// read - an {type:"oversize"} frame is sent instead (fail closed). The
// host side kills any frame announcing more than cap + 1 bytes, so no
// allocation beyond the cap ever happens on the trusted side.

import fs from "node:fs";
import path from "node:path";

const DIR = "/workspace/.bridge";
const CAP = 4 * 1024 * 1024 + 1024;

fs.mkdirSync(DIR, { recursive: true });

function sendFrame(obj) {
    const payload = Buffer.from(JSON.stringify(obj), "utf8");
    const head = Buffer.alloc(4);
    head.writeUInt32BE(payload.length, 0);
    process.stdout.write(Buffer.concat([head, payload]));
}

const seen = new Set();
function poll() {
    let names;
    try {
        names = fs.readdirSync(DIR);
    } catch {
        return;
    }
    for (const name of [...seen]) {
        if (!names.includes(name)) seen.delete(name); // delivered/cleaned up
    }
    for (const name of names) {
        if (!name.endsWith(".req") || seen.has(name)) continue;
        seen.add(name);
        const id = name.slice(0, -4);
        const full = path.join(DIR, name);
        try {
            const st = fs.statSync(full);
            if (st.size > CAP) {
                sendFrame({ type: "oversize", id });
                continue;
            }
            const envelope = JSON.parse(fs.readFileSync(full, "utf8"));
            sendFrame({ type: "request", envelope });
        } catch (err) {
            sendFrame({
                type: "oversize",
                id,
                reason: String(err?.message ?? err),
            });
        }
    }
}
setInterval(poll, 120);
