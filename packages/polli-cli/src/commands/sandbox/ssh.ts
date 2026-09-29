import { execFileSync } from "node:child_process";
import {
    chmodSync,
    existsSync,
    mkdirSync,
    readFileSync,
    realpathSync,
    writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fail, printInfo } from "../../lib/output.js";
import bootstrap from "./bootstrap.sh?raw";
import { type Connection, connectSandbox } from "./e2b.js";

const SSH_DIR = join(homedir(), ".pollinations", "ssh");
const SSH_KEY = join(SSH_DIR, "id_ed25519");
const SSH_CONFIG = join(SSH_DIR, "config");
const USER_SSH_CONFIG = join(homedir(), ".ssh", "config");
const INCLUDE = "Include ~/.pollinations/ssh/config";
// websocat in the sandbox relays this port's WebSocket to sshd.
const SSH_PORT = 8022;
// Renews the lease well before it runs out while a connection is open.
const RENEW_MS = 300_000;

const sandboxUrl = (s: Connection, port: number, scheme = "https") =>
    `${scheme}://${port}-${s.sandboxID}.${s.domain || "e2b.app"}`;

// Runs a script as root through envd, the agent in every E2B sandbox. Its
// Connect RPC takes and returns length-prefixed JSON messages.
async function runAsRoot(
    s: Connection,
    script: string,
    envs: Record<string, string>,
) {
    const request = Buffer.from(
        JSON.stringify({
            process: { cmd: "/bin/bash", args: ["-c", script], envs },
        }),
    );
    const frame = Buffer.alloc(5 + request.length);
    frame.writeUInt32BE(request.length, 1);
    request.copy(frame, 5);
    const res = await fetch(`${sandboxUrl(s, 49983)}/process.Process/Start`, {
        method: "POST",
        headers: {
            "content-type": "application/connect+json",
            authorization: `Basic ${Buffer.from("root:").toString("base64")}`,
            ...(s.envdAccessToken && { "x-access-token": s.envdAccessToken }),
        },
        body: frame,
    });
    if (!res.ok) throw new Error(`envd ${res.status}: ${await res.text()}`);
    const body = Buffer.from(await res.arrayBuffer());
    let output = "";
    let exitCode: number | undefined;
    for (let at = 0; at + 5 <= body.length; ) {
        const length = body.readUInt32BE(at + 1);
        const message = JSON.parse(
            body.subarray(at + 5, at + 5 + length).toString(),
        );
        // Flag 2 marks the end of the stream, which may carry an error.
        if (body[at] & 2 && message.error) {
            throw new Error(`envd: ${message.error.message}`);
        }
        const event = message.event ?? {};
        for (const data of [event.data?.stdout, event.data?.stderr]) {
            if (data) output += Buffer.from(data, "base64").toString();
        }
        // Protobuf JSON omits a zero exit code.
        if (event.end) exitCode = event.end.exitCode ?? 0;
        at += 5 + length;
    }
    if (exitCode !== 0) {
        throw new Error(`setup exited with ${exitCode}: ${output.trim()}`);
    }
}

// Pipes stdin and stdout to sshd in the sandbox; ssh runs this per connection.
export async function proxy(host: string) {
    const id = host.replace(/\.polli$/, "");
    if (!/^[a-z0-9]+$/.test(id)) {
        fail(`Expected <sandbox-id>.polli, got "${host}"`);
    }
    if (typeof WebSocket === "undefined")
        fail("This needs Node.js 22 or newer");
    const sandbox = await connectSandbox(id);
    await runAsRoot(sandbox, bootstrap, {
        POLLI_SSH_KEY: readFileSync(`${SSH_KEY}.pub`, "utf8").trim(),
        POLLI_SSH_PORT: String(SSH_PORT),
    });
    const renew = setInterval(
        () =>
            connectSandbox(id).catch((err) =>
                process.stderr.write(`polli: lease renewal failed: ${err}\n`),
            ),
        RENEW_MS,
    );
    // Node's WebSocket accepts headers; a private sandbox needs its traffic token.
    const ws = new WebSocket(sandboxUrl(sandbox, SSH_PORT, "wss"), {
        headers: sandbox.trafficAccessToken
            ? { "e2b-traffic-access-token": sandbox.trafficAccessToken }
            : {},
    } as unknown as string[]);
    ws.binaryType = "arraybuffer";
    await new Promise<void>((resolve, reject) => {
        ws.onopen = () => {
            process.stdin.on("data", (chunk) => {
                ws.send(chunk);
                // Hold stdin while the socket drains so uploads stay in bounds.
                if (ws.bufferedAmount > 4_000_000) {
                    process.stdin.pause();
                    const wait = setInterval(() => {
                        if (ws.bufferedAmount > 1_000_000) return;
                        clearInterval(wait);
                        process.stdin.resume();
                    }, 10);
                }
            });
            process.stdin.on("end", () => ws.close());
        };
        ws.onmessage = (event) =>
            process.stdout.write(Buffer.from(event.data as ArrayBuffer));
        ws.onclose = () => resolve();
        ws.onerror = () => reject(new Error("WebSocket to the sandbox failed"));
    }).finally(() => {
        clearInterval(renew);
        process.stdin.destroy();
    });
}

export function setupSsh() {
    mkdirSync(SSH_DIR, { recursive: true, mode: 0o700 });
    if (!existsSync(SSH_KEY)) {
        execFileSync("ssh-keygen", [
            "-q",
            "-t",
            "ed25519",
            "-N",
            "",
            "-C",
            "polli-sandbox",
            "-f",
            SSH_KEY,
        ]);
    }
    // Absolute paths, so editors that start ssh without the shell's PATH work.
    const polli = `"${process.execPath}" "${realpathSync(process.argv[1])}"`;
    writeFileSync(
        SSH_CONFIG,
        [
            "# Written by `polli sandbox ssh-config`.",
            "Host *.polli",
            "    User user",
            `    IdentityFile ${SSH_KEY}`,
            "    IdentitiesOnly yes",
            `    UserKnownHostsFile ${join(SSH_DIR, "known_hosts")}`,
            "    StrictHostKeyChecking accept-new",
            `    ProxyCommand ${polli} sandbox proxy %h`,
            "",
        ].join("\n"),
    );
    const current = existsSync(USER_SSH_CONFIG)
        ? readFileSync(USER_SSH_CONFIG, "utf8")
        : "";
    if (!current.split("\n").includes(INCLUDE)) {
        mkdirSync(join(homedir(), ".ssh"), { recursive: true, mode: 0o700 });
        // Include must come before any Host block to apply everywhere.
        writeFileSync(USER_SSH_CONFIG, `${INCLUDE}\n\n${current}`);
        chmodSync(USER_SSH_CONFIG, 0o600);
        printInfo(`Added "${INCLUDE}" to ${USER_SSH_CONFIG}`);
    }
}
