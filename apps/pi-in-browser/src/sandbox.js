// Wasmer sandbox lifecycle: package download, guest provisioning, the pump
// transport, guided Pi runs (JSONL events), interactive terminal sessions,
// and bounded file collection for the workspace tree and ZIP export.
// Every collector on this (trusted) side has an incremental byte budget:
// a guest that emits endless output gets its process killed, not our memory.

import { createBridgeHost, createFrameParser } from "./bridgeHost.js";
import {
    buildAuthJson,
    buildModelsJson,
    buildSessionJson,
    buildSettingsJson,
    GUEST,
    PI_WEBC_URLS,
    piRunArgs,
} from "./piConfig.js";

const SHELL_OUTPUT_CAP = 64 * 1024;
const PI_TOTAL_CAP = 32 * 1024 * 1024; // cumulative stdout budget per run
const PI_LINE_CAP = 1024 * 1024;
const EXPORT_FILE_CAP = 32 * 1024 * 1024;
const EXPORT_TOTAL_CAP = 128 * 1024 * 1024;
const EXPORT_COUNT_CAP = 2048;
const EXPORT_DEPTH_CAP = 12;
const B64_CHUNK = 48 * 1024; // argv-safe base64 chunk for guest writes

export function b64encode(text) {
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) {
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    }
    return btoa(binary);
}

export const kill = async (proc) => {
    try {
        await proc.kill();
    } catch {}
};

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
    const proc = await sandbox.command("bash", ["-c", script]).spawn({
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd: GUEST.home,
    });
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

// Fallback guest writer used when the SDK fs API is unavailable: base64
// chunks piped through bash inside the sandbox.
export async function writeGuestFileViaShell(sandbox, path, content) {
    const b64 = b64encode(content);
    await runShell(sandbox, `mkdir -p "$(dirname "${path}")"`);
    for (let i = 0; i < b64.length; i += B64_CHUNK) {
        const op = i === 0 ? ">" : ">>";
        const part = b64.slice(i, i + B64_CHUNK);
        const r = await runShell(
            sandbox,
            `printf %s '${part}' | base64 -d ${op} "${path}.part"`,
        );
        if (r.code !== 0) {
            throw new Error(`guest write failed for ${path}: ${r.stderr}`);
        }
    }
    await runShell(sandbox, `mv "${path}.part" "${path}"`);
}

// Preferred guest writer: direct fs write through the SDK, with the shell
// path as a fallback.
export async function writeGuestFile(sandbox, path, content) {
    try {
        await sandbox.fs.writeText(path, content);
    } catch {
        await writeGuestFileViaShell(sandbox, path, content);
    }
}

export async function loadPiPackage(
    wasmer,
    onProgress = () => {},
    fetchImpl = fetch,
) {
    let lastError = null;
    for (const url of PI_WEBC_URLS) {
        try {
            onProgress(`downloading Pi runtime from ${url}`);
            const response = await fetchImpl(url);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const bytes = new Uint8Array(await response.arrayBuffer());
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

// Fetches the guest extension and pump sources shipped next to the app.
async function readGuestSources(fetchImpl) {
    const [bridge, pump] = await Promise.all([
        fetchImpl("guest/bridge.mjs").then((r) => {
            if (!r.ok) throw new Error("guest/bridge.mjs missing from build");
            return r.text();
        }),
        fetchImpl("guest/pump.mjs").then((r) => {
            if (!r.ok) throw new Error("guest/pump.mjs missing from build");
            return r.text();
        }),
    ]);
    return { bridge, pump };
}

// Creates the sandbox with the guest Pi configuration and bridge sources
// already in place, and the network fully disabled.
export async function createSandbox({
    wasmer,
    piPackage,
    models,
    defaultModel,
    fetchImpl = fetch,
}) {
    const { bridge, pump } = await readGuestSources(fetchImpl);
    return wasmer.sandboxes.create({
        packages: [piPackage],
        network: { mode: "disabled" },
        env: {
            HOME: GUEST.home,
            PI_CODING_AGENT_DIR: GUEST.agentDir,
            PATH: "/bin:/usr/bin",
        },
        files: {
            [`${GUEST.agentDir}/models.json`]: JSON.stringify(
                buildModelsJson(models),
            ),
            [`${GUEST.agentDir}/auth.json`]: JSON.stringify(buildAuthJson()),
            [`${GUEST.agentDir}/settings.json`]: JSON.stringify(
                buildSettingsJson(defaultModel),
            ),
            [GUEST.extensionPath]: bridge,
            [GUEST.pumpPath]: pump,
            [`${GUEST.home}/README.md`]:
                "# Pi workspace\n\nAsk Pi to create or edit files here.\n",
        },
    });
}

// Spawns the pump and returns the bridge transport: request frames in via
// bounded stdout chunks, streamed response frames out via stdin.
export async function startBridge(sandbox, { apiKey, log = () => {} }) {
    const proc = await sandbox.command("node", [GUEST.pumpPath]).spawn({
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        cwd: GUEST.home,
    });

    const parseFrames = createFrameParser((frame) => {
        queueMicrotask(() => host.onFrame(frame));
    });
    const sendFrame = (frame) => {
        const payload = Buffer.from(JSON.stringify(frame), "utf8");
        const head = Buffer.alloc(4);
        head.writeUInt32BE(payload.length, 0);
        return proc.stdin.write(new Uint8Array(Buffer.concat([head, payload])));
    };
    const host = createBridgeHost({ apiKey, sendFrame, log });

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
            ).slice(-4000);
        }
    })();

    onBytes = (chunk) => parseFrames(new Uint8Array(chunk));

    return {
        host,
        pump: {
            getStderr: () => stderrTail,
            terminate: () => kill(proc),
        },
    };
}

// Runs one guided Pi invocation, streaming parsed JSONL events to onEvent.
// Returns { result, kill } so Stop can terminate a hung run; the JSONL
// line buffer is capped - an unterminated megabyte line kills the process.
export function runPi(sandbox, { model, prompt, continueSession, onEvent }) {
    let proc = null;
    const result = (async () => {
        await writeGuestFile(
            sandbox,
            GUEST.sessionPath,
            JSON.stringify(buildSessionJson({ runId: "session", keyGen: 1 })),
        );
        const args = piRunArgs({
            model,
            prompt,
            continueSession,
            mode: "json",
        });
        proc = await sandbox.command("pi", args).spawn({
            stdin: "pipe",
            stdout: "pipe",
            stderr: "pipe",
            cwd: GUEST.home,
        });
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
            if (totalOut > PI_TOTAL_CAP || lineBuf.length > PI_LINE_CAP) {
                outputKilled = true;
                await kill(proc);
                break;
            }
            lineBuf += text;
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
        if (lineBuf.trim()) {
            const trimmed = lineBuf.replace(/\r$/, "");
            try {
                onEvent(JSON.parse(trimmed));
            } catch {
                onEvent({ type: "raw", text: trimmed });
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

// Spawns Pi in full interactive TUI mode, wired to an xterm.js terminal.
export async function spawnTerminal(sandbox, { model }) {
    const args = [
        "--extension",
        GUEST.extensionPath,
        "--provider",
        "pollinations",
    ];
    if (model) args.push("--model", model);
    return sandbox.command("pi", args).spawn({
        terminal: true,
        cwd: GUEST.home,
    });
}

// Collects the workspace file tree with caps (fail closed), reading file
// contents through the SDK.
export async function collectWorkspace(sandbox, onProgress = () => {}) {
    const files = [];
    let total = 0;
    let truncated = false;
    const walk = async (dir, rel, depth) => {
        if (files.length >= EXPORT_COUNT_CAP || truncated) return;
        if (depth > EXPORT_DEPTH_CAP) {
            truncated = true;
            return;
        }
        let entries;
        try {
            entries = await sandbox.fs.readDir(dir);
        } catch {
            return;
        }
        for (const entry of entries) {
            if (files.length >= EXPORT_COUNT_CAP) {
                truncated = true;
                return;
            }
            const childRel = rel ? `${rel}/${entry.name}` : entry.name;
            const child =
                dir === "/" ? `/${entry.name}` : `${dir}/${entry.name}`;
            if (entry.kind === "directory") {
                // Bridge/config plumbing is not part of the user workspace.
                if (
                    child === "/workspace/.bridge" ||
                    child === "/workspace/.pi"
                )
                    continue;
                files.push({ path: childRel, type: "dir" });
                await walk(child, childRel, depth + 1);
            } else {
                let content;
                try {
                    const stat = await sandbox.fs.stat(child);
                    if (stat.size > EXPORT_FILE_CAP) {
                        truncated = true;
                        continue;
                    }
                    if (total + stat.size > EXPORT_TOTAL_CAP) {
                        truncated = true;
                        continue;
                    }
                    content = await sandbox.fs.readText(child);
                    total += stat.size;
                } catch {
                    continue;
                }
                files.push({ path: childRel, type: "file", content });
                onProgress(files.length);
            }
        }
    };
    await walk(GUEST.home, "", 0);
    return { files, truncated };
}
