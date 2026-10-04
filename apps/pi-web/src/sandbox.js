// Wasmer sandbox lifecycle: package download, guest provisioning, the pump
// transport, Pi runs, shell commands and bounded file reads for ZIP export.
// Every collector on this (trusted) side has an incremental byte budget:
// a guest that emits endless output gets its process killed, not our memory.

import { ID_RE } from "./bridgeHost.js";
import {
    buildSessionJson,
    GUEST,
    PI_PACKAGE_SPEC,
    piRunArgs,
} from "./piConfig.js";

export const PI_WEBC_URLS = [
    // Local copy first (development / e2e), then the pinned Wasmer registry.
    "./pi.webc",
    `https://registry-cdn.wasmer.io/packages/wasmer/pi/${PI_PACKAGE_SPEC.split("@=")[1]}`,
];

const B64_CHUNK = 48 * 1024; // argv-safe base64 chunk for guest writes
const EXPORT_FILE_CAP = 64 * 1024 * 1024;
const EXPORT_TOTAL_CAP = 256 * 1024 * 1024;
const EXPORT_DEPTH_CAP = 12;
const EXPORT_COUNT_CAP = 4096; // max collected files, enforced during traversal
const EXPORT_VISIT_CAP = 20000; // every visited entry counts (dirs included)
const EXPORT_LISTING_CAP = 2 * 1024 * 1024; // per-directory listing bytes
const SHELL_OUTPUT_CAP = 64 * 1024;
const PI_LINE_CAP = 1024 * 1024;
const PI_TOTAL_CAP = 32 * 1024 * 1024; // cumulative stdout budget per run
const PUMP_STDERR_CAP = 16 * 1024;

function b64encode(text) {
    const bytes = new TextEncoder().encode(text);
    let bin = "";
    for (let i = 0; i < bytes.length; i += 8192)
        bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(bin);
}

const kill = async (proc) => {
    try {
        await proc.kill();
    } catch {}
};

// Bounded capture of a process stream: accumulates at most capBytes, then
// kills the process. Returns what fit.
async function captureBounded(stream, capBytes, proc, onKill) {
    const decoder = new TextDecoder();
    let out = "";
    let killed = false;
    if (!stream) return { text: out, killed };
    for await (const chunk of stream) {
        out += decoder.decode(chunk, { stream: true });
        if (out.length > capBytes) {
            killed = true;
            onKill?.();
            await kill(proc);
            break;
        }
    }
    return { text: out, killed };
}

export async function runShell(sandbox, script, maxOut = SHELL_OUTPUT_CAP) {
    const proc = await sandbox
        .command("bash", ["-c", script])
        .spawn({ stdout: "pipe", stderr: "pipe" });
    const [out, err] = await Promise.all([
        captureBounded(proc.stdout, maxOut, proc),
        captureBounded(proc.stderr, maxOut, proc),
    ]);
    const result = await proc
        .wait({ check: false })
        .catch(() => ({ exitCode: -1 }));
    return {
        code: result.exitCode,
        stdout: out.text,
        stderr: err.text,
        outputKilled: out.killed || err.killed,
    };
}

export async function writeGuestFile(sandbox, path, content) {
    const b64 = b64encode(content);
    await runShell(sandbox, `mkdir -p "$(dirname "${path}")"`);
    for (let i = 0; i < b64.length; i += B64_CHUNK) {
        const op = i === 0 ? ">" : ">>";
        const part = b64.slice(i, i + B64_CHUNK);
        const r = await runShell(
            sandbox,
            `printf %s '${part}' | base64 -d ${op} "${path}.part"`,
        );
        if (r.code !== 0)
            throw new Error(`guest write failed for ${path}: ${r.stderr}`);
    }
    await runShell(sandbox, `mv "${path}.part" "${path}"`);
}

export async function loadPiPackage(wasmer, onProgress = () => {}) {
    let lastError = null;
    for (const url of PI_WEBC_URLS) {
        try {
            onProgress(`downloading Pi runtime from ${url}`);
            const resp = await fetch(url);
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
            const bytes = new Uint8Array(await resp.arrayBuffer());
            onProgress(
                `compiling Pi runtime (${(bytes.length / 1024 / 1024).toFixed(1)} MB, first run can take a minute)`,
            );
            const pkg = await wasmer.packages.load(bytes);
            onProgress("Pi runtime ready");
            return pkg;
        } catch (err) {
            lastError = err;
            onProgress(`source failed (${err.message}), trying next`);
        }
    }
    throw lastError ?? new Error("no Pi package source available");
}

export async function createSandbox(wasmer, piPackage) {
    return wasmer.sandboxes.create({
        packages: [piPackage],
        network: { mode: "disabled" },
        env: {
            HOME: GUEST.home,
            PI_CODING_AGENT_DIR: GUEST.agentDir,
            PATH: "/bin:/usr/bin",
        },
    });
}

// Spawns the pump and returns the bridge transport: request frames in via
// bounded stdout chunks, responses out via direct guest file writes
// (host-side, size-controlled). Response ids are re-validated here: an id
// that does not match the strict shape must never reach a shell path.
export async function startPumpTransport(sandbox) {
    const proc = await sandbox
        .command("node", [GUEST.pumpPath])
        .spawn({ stdout: "pipe", stderr: "pipe" });
    let onBytes = () => {};
    (async () => {
        for await (const chunk of proc.stdout) onBytes(chunk);
    })();
    let stderrTail = "";
    (async () => {
        if (!proc.stderr) return;
        const decoder = new TextDecoder();
        for await (const chunk of proc.stderr) {
            stderrTail = (
                stderrTail + decoder.decode(chunk, { stream: true })
            ).slice(-PUMP_STDERR_CAP);
        }
    })();
    return {
        onFrame: (cb) => {
            onBytes = cb;
        },
        send: async (frame) => {
            if (typeof frame?.id !== "string" || !ID_RE.test(frame.id)) {
                throw new Error(
                    "refusing to write a response for a malformed id",
                );
            }
            const path = `${GUEST.bridgeDir}/${frame.id}.resp`;
            await writeGuestFile(sandbox, path, JSON.stringify(frame));
            await runShell(
                sandbox,
                `rm -f "${GUEST.bridgeDir}/${frame.id}.req"`,
            );
        },
        getStderr: () => stderrTail,
        terminate: () => kill(proc),
    };
}

// Runs one Pi invocation, streaming parsed JSONL events to onEvent.
// Returns { result, kill } so Stop can terminate a hung run; the JSONL line
// buffer is capped - an unterminated megabyte line kills the process.
export function runPi(
    sandbox,
    { model, prompt, continueSession, runId, keyGen, onEvent },
) {
    let proc = null;
    const result = (async () => {
        await writeGuestFile(
            sandbox,
            GUEST.sessionPath,
            JSON.stringify(buildSessionJson({ runId, keyGen })),
        );
        const args = piRunArgs({ model, prompt, continueSession });
        proc = await sandbox
            .command("pi", args)
            .spawn({ stdout: "pipe", stderr: "pipe" });
        const decoder = new TextDecoder();
        let lineBuf = "";
        let stderrTail = "";
        let outputKilled = false;
        let totalOut = 0;
        const stderrTask = (async () => {
            if (!proc.stderr) return;
            for await (const chunk of proc.stderr) {
                stderrTail = (
                    stderrTail + decoder.decode(chunk, { stream: true })
                ).slice(-4000);
            }
        })();
        for await (const chunk of proc.stdout) {
            const text = decoder.decode(chunk, { stream: true });
            totalOut += text.length;
            // cumulative budget: an endless drip of small valid events must
            // not grow the trusted page without bounds - kill the producer
            if (totalOut > PI_TOTAL_CAP) {
                outputKilled = true;
                await kill(proc);
                break;
            }
            lineBuf += text;
            if (lineBuf.length > PI_LINE_CAP) {
                outputKilled = true;
                await kill(proc);
                break;
            }
            const lines = lineBuf.split("\n");
            lineBuf = lines.pop();
            for (const line of lines) {
                const trimmed = line.replace(/\r$/, "");
                if (!trimmed) continue;
                try {
                    onEvent(JSON.parse(trimmed));
                } catch {
                    onEvent({ type: "raw", text: trimmed });
                }
            }
        }
        await stderrTask;
        const waitResult = await proc
            .wait({ check: false })
            .catch(() => ({ exitCode: -1 }));
        return { exitCode: waitResult.exitCode, stderrTail, outputKilled };
    })();
    return { result, kill: () => (proc ? kill(proc) : Promise.resolve()) };
}

// Bounded recursive read of the workspace for ZIP export: binary-safe,
// fail-closed on stat errors, with per-file, aggregate, depth and entry-count
// budgets. Excludes .bridge and .pi (session/config internals) by design.
// Reads go through `head -c <budget>` in the guest, so a file that grows
// between stat and read cannot exceed its budget (TOCTOU-safe at the read
// boundary), and the entry count is enforced while walking, before any
// accumulation. Returns { files, truncated }.
const shq = (p2) => `'${String(p2).replace(/'/g, `'\\''`)}'`;

export async function exportWorkspaceFiles(sandbox, root = GUEST.home) {
    const files = [];
    let total = 0;
    let truncated = false;
    let visited = 0;
    // Bounded directory listing via the guest shell: an unrestricted
    // fs.readDir would materialize a hostile million-entry fan-out in
    // trusted-page memory before any budget check could run.
    const listDir = async (dir) => {
        // names only (no -printf: not portable to the WASIX coreutils);
        // the type comes from the per-entry stat below. basename strips the
        // dir prefix; output stays bounded by head -c.
        const r = await runShell(
            sandbox,
            `find ${shq(dir)} -mindepth 1 -maxdepth 1 -print 2>/dev/null | head -c ${EXPORT_LISTING_CAP}`,
            EXPORT_LISTING_CAP + 64,
        );
        if (r.code !== 0) return []; // fail closed
        if (r.outputKilled) truncated = true;
        const prefix = `${dir}/`;
        return r.stdout
            .split("\n")
            .filter(Boolean)
            .filter((full) => full.startsWith(prefix))
            .map((full) => ({ name: full.slice(prefix.length) }));
    };
    const walk = async (dir, prefix, depth) => {
        if (depth > EXPORT_DEPTH_CAP || truncated) return;
        const entries = await listDir(dir);
        for (const entry of entries) {
            visited += 1; // dirs, excluded and failed-stat entries all count
            if (
                visited > EXPORT_VISIT_CAP ||
                files.length >= EXPORT_COUNT_CAP
            ) {
                truncated = true;
                return;
            }
            const { name } = entry;
            if (name === ".bridge" || name === ".pi") continue;
            if (!name || name.includes("/")) continue; // fail closed
            const full = `${dir}/${name}`;
            const rel = prefix ? `${prefix}/${name}` : name;
            const st = await sandbox.fs.stat(full).catch(() => null);
            if (!st) continue; // fail closed
            if (st.isDirectory) {
                await walk(full, rel, depth + 1);
                continue;
            }
            const budget = Math.min(EXPORT_FILE_CAP, EXPORT_TOTAL_CAP - total);
            if (budget <= 0) {
                truncated = true;
                return;
            }
            // cap bytes at the source; base64 -w0 keeps one line
            const r = await runShell(
                sandbox,
                `head -c ${budget} ${shq(full)} | base64 -w0`,
                Math.ceil((budget * 4) / 3) + 64,
            );
            if (r.code !== 0 || r.outputKilled) continue; // fail closed
            const data = Uint8Array.from(atob(r.stdout.trim()), (c) =>
                c.charCodeAt(0),
            );
            total += data.length;
            files.push({ name: rel, data });
        }
    };
    await walk(root, "", 0);
    return { files, truncated };
}
