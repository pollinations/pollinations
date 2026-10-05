// Pi extension that runs inside the browser sandbox.
//
// The sandbox has no network, so outbound HTTP from Pi would fail. This
// extension replaces globalThis.fetch with a file-based mailbox:
//
//   guest writes /workspace/.bridge/<id>.req   (JSON envelope)
//   host  reads it, performs the real HTTPS call on the trusted side,
//   host  writes /workspace/.bridge/<id>.resp  (JSON envelope)
//   guest reads the reply and returns a Response
//
// The API key never enters the sandbox: models.json holds the literal
// placeholder "bridge" and the host attaches the real Authorization header.

import crypto from "node:crypto";
import fs from "node:fs";

const DIR = "/workspace/.bridge";
const POLL_MS = 100;
const TIMEOUT_MS = 180000;

function envelopePath(id) {
    return `${DIR}/${id}`;
}

export default function bridgeExtension(pi) {
    fs.mkdirSync(DIR, { recursive: true });

    globalThis.fetch = async (url, options = {}) => {
        const id = crypto.randomUUID();
        const request = {
            id,
            url: String(url),
            method: options.method ?? "GET",
            headers: options.headers ? Object.fromEntries(new Headers(options.headers)) : {},
            body: options.body == null ? null : String(options.body),
        };
        // Write atomically: Pi may poll the directory concurrently.
        fs.writeFileSync(`${envelopePath(id)}.req.tmp`, JSON.stringify(request));
        fs.renameSync(`${envelopePath(id)}.req.tmp`, `${envelopePath(id)}.req`);

        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (fs.existsSync(`${envelopePath(id)}.resp`)) {
                const reply = JSON.parse(fs.readFileSync(`${envelopePath(id)}.resp`, "utf8"));
                try {
                    fs.unlinkSync(`${envelopePath(id)}.resp`);
                } catch {}
                return new Response(
                    reply.body === null || reply.body === undefined
                        ? null
                        : Buffer.from(reply.body, "base64"),
                    { status: reply.status ?? 502, headers: reply.headers ?? {} },
                );
            }
            await new Promise((resolve) => setTimeout(resolve, POLL_MS));
        }
        throw new Error(`pi-web bridge timed out waiting for ${id}`);
    };

    pi.on?.("session_start", () => {
        console.error("[pi-web] fetch bridge active");
    });
}
