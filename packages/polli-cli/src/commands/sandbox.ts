import { execFileSync, spawn } from "node:child_process";
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
import { Command } from "commander";
import { gen, requireKey } from "../lib/api.js";
import { BASE_URL } from "../lib/config.js";
import { fail, printInfo, printSuccess } from "../lib/output.js";

// Gen serves E2B's API here, so E2B's own CLI and SDKs work against it.
const E2B_PATH = "/alpha/e2b";
const SSH_DIR = join(homedir(), ".pollinations", "ssh");
const SSH_KEY = join(SSH_DIR, "id_ed25519");
const SSH_CONFIG = join(SSH_DIR, "config");
const USER_SSH_CONFIG = join(homedir(), ".ssh", "config");
const INCLUDE = "Include ~/.pollinations/ssh/config";
// websocat in the sandbox relays this port's WebSocket to sshd.
const SSH_PORT = 8022;
// Each connection keeps the sandbox paid for this long, renewed while open.
const LEASE_SECONDS = 600;
const RENEW_MS = 300_000;

interface Connection {
    sandboxID: string;
    domain?: string | null;
    envdAccessToken?: string;
    trafficAccessToken?: string | null;
}

// Idempotent: installs sshd, rsync and websocat on the first connection only.
// E2B sandboxes run systemd, which runs sshd once installed. E2B's base image
// sets `PermitEmptyPasswords yes` and `user` has no password, so sshd would
// accept a login without a key; the settings prepended below win because sshd
// uses the first value it reads.
const BOOTSTRAP = `set -e
if [ ! -x /usr/sbin/sshd ] || ! command -v rsync >/dev/null; then
    command -v apt-get >/dev/null || { echo "polli ssh needs a Debian-based template" >&2; exit 1; }
    apt-get update -qq
    DEBIAN_FRONTEND=noninteractive apt-get install -y -qq --no-upgrade openssh-server rsync >/dev/null
fi
if [ ! -x /usr/local/bin/websocat ]; then
    curl -fsSL -o /tmp/websocat https://github.com/vi/websocat/releases/download/v1.14.1/websocat.x86_64-unknown-linux-musl
    echo "66f8dd3a0394761556339117f8bb5123bddefd44e087af2a72ec22b0bd08d514  /tmp/websocat" | sha256sum -c --quiet
    install -m 755 /tmp/websocat /usr/local/bin/websocat
fi
mkdir -p /run/sshd
ssh-keygen -A >/dev/null
key_only() {
    test "$(sshd -T | grep -cxE '(permitemptypasswords|passwordauthentication|kbdinteractiveauthentication|permitrootlogin) no')" = 4
}
if key_only; then
    systemctl start ssh
else
    printf 'PermitEmptyPasswords no\\nPasswordAuthentication no\\nKbdInteractiveAuthentication no\\nPermitRootLogin no\\n\\n' |
        cat - /etc/ssh/sshd_config > /tmp/sshd_config
    cat /tmp/sshd_config > /etc/ssh/sshd_config
    key_only
    systemctl restart ssh
fi
install -d -m 700 -o user -g user /home/user/.ssh
touch /home/user/.ssh/authorized_keys
grep -qxF "$POLLI_SSH_KEY" /home/user/.ssh/authorized_keys || printf '%s\\n' "$POLLI_SSH_KEY" >> /home/user/.ssh/authorized_keys
chown user:user /home/user/.ssh/authorized_keys
chmod 600 /home/user/.ssh/authorized_keys
if ! { [ -s /run/polli-ws.pid ] && kill -0 "$(cat /run/polli-ws.pid)" 2>/dev/null; }; then
    setsid nohup sh -c 'while :; do websocat -b -E ws-l:0.0.0.0:${SSH_PORT} tcp:127.0.0.1:22; sleep 1; done' >/dev/null 2>&1 </dev/null &
    echo $! > /run/polli-ws.pid
fi
for i in $(seq 50); do
    (exec 3<>/dev/tcp/127.0.0.1/22 4<>/dev/tcp/127.0.0.1/${SSH_PORT}) 2>/dev/null && exit 0
    sleep 0.1
done
echo "sshd or websocat did not start" >&2
exit 1
`;

// Resumes a paused sandbox and makes sure it is paid for LEASE_SECONDS.
const connect = (id: string) =>
    gen<Connection>(`${E2B_PATH}/sandboxes/${id}/connect`, {
        method: "POST",
        body: { timeout: LEASE_SECONDS },
    });

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
async function proxy(host: string) {
    const id = host.replace(/\.polli$/, "");
    if (!/^[a-z0-9]+$/.test(id)) {
        fail(`Expected <sandbox-id>.polli, got "${host}"`);
    }
    if (typeof WebSocket === "undefined")
        fail("This needs Node.js 22 or newer");
    const sandbox = await connect(id);
    await runAsRoot(sandbox, BOOTSTRAP, {
        POLLI_SSH_KEY: readFileSync(`${SSH_KEY}.pub`, "utf8").trim(),
    });
    const renew = setInterval(
        () =>
            connect(id).catch((err) =>
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

function setupSsh() {
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
    printSuccess(
        "ssh, scp and rsync now reach sandboxes as <sandbox-id>.polli, e.g.\n" +
            "  ssh <id>.polli\n  scp file.txt <id>.polli:\n  rsync -a dir/ <id>.polli:dir/",
    );
}

export const sandboxCommand = new Command("sandbox")
    .description("E2B sandboxes billed to your Pollinations account")
    .addCommand(
        new Command("env")
            .description(
                "Run a command with E2B's CLI and SDKs pointed at Pollinations",
            )
            .argument("<command...>", "e.g. -- npx @e2b/cli sandbox list")
            .action(async ([file, ...args]: string[]) => {
                // Passed in the environment, never printed.
                const env = {
                    ...process.env,
                    E2B_API_URL: `${BASE_URL}${E2B_PATH}`,
                    E2B_API_KEY: requireKey(),
                };
                const child = spawn(file, args, {
                    stdio: "inherit",
                    env,
                    shell: process.platform === "win32",
                });
                // Ctrl-C reaches the child, which decides when to exit.
                process.on("SIGINT", () => {});
                process.exitCode = await new Promise<number>((resolve) => {
                    child.on("error", (err) => {
                        process.stderr.write(`${err.message}\n`);
                        resolve(127);
                    });
                    child.on("exit", (code) => resolve(code ?? 1));
                });
            }),
    )
    .addCommand(
        new Command("ssh-config")
            .description("Set up ssh, scp and rsync to <sandbox-id>.polli")
            .action(() => {
                try {
                    setupSsh();
                } catch (err) {
                    fail("Failed to set up ssh", err);
                }
            }),
    )
    .addCommand(
        new Command("proxy")
            .description("ssh ProxyCommand for <sandbox-id>.polli")
            .argument("<host>")
            .action(async (host: string) => {
                requireKey();
                try {
                    await proxy(host);
                } catch (err) {
                    fail(`Could not reach sandbox ${host}`, err);
                }
            }),
        { hidden: true },
    );
