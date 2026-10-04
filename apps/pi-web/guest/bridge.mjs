// Pi extension: bridges the provider's HTTP traffic to the host page.
// The sandbox has no network ("disabled"), so this shim replaces
// globalThis.fetch: every request is serialized to
// /workspace/.bridge/<uuid>.req and the answer arrives as <uuid>.resp,
// written by the host through the pump process. The real API key never
// enters the guest - models.json holds the dummy "bridge" credential and
// the host sets the Authorization header on the trusted side.

import crypto from "node:crypto";
import fs from "node:fs";

const DIR = "/workspace/.bridge";
const SESSION_PATH = "/workspace/.bridge/session.json";
const TIMEOUT_MS = 110000;

function readSession() {
    try {
        return JSON.parse(fs.readFileSync(SESSION_PATH, "utf8"));
    } catch {
        return { runId: "unknown", keyGen: 0 };
    }
}

export default function bridgeExtension(pi) {
    fs.mkdirSync(DIR, { recursive: true });

    globalThis.fetch = async (url, opts = {}) => {
        const session = readSession();
        const id = crypto.randomUUID();
        const envelope = {
            id,
            runId: session.runId,
            keyGen: session.keyGen,
            url: String(url),
            method: opts.method === "POST" ? "POST" : "GET",
            body: opts.body == null ? null : String(opts.body),
        };
        const tmp = `${DIR}/${id}.req.tmp`;
        fs.writeFileSync(tmp, JSON.stringify(envelope));
        fs.renameSync(tmp, `${DIR}/${id}.req`);

        const respPath = `${DIR}/${id}.resp`;
        const deadline = Date.now() + TIMEOUT_MS;
        while (Date.now() < deadline) {
            if (fs.existsSync(respPath)) {
                const frame = JSON.parse(fs.readFileSync(respPath, "utf8"));
                try {
                    fs.unlinkSync(respPath);
                } catch {}
                return new Response(
                    Buffer.from(frame.bodyB64 ?? "", "base64"),
                    {
                        status: frame.status,
                        headers: frame.headers,
                    },
                );
            }
            await new Promise((resolve) => setTimeout(resolve, 150));
        }
        throw new Error(`bridge timeout for request ${id}`);
    };

    pi.on("session_start", () => {
        console.error("[pi-web bridge] fetch shim active");
    });
}
