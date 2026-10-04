// UI wiring: connect (BYOP), model picker, guided Pi runs, shell box,
// workspace export. Zero framework by design (quest: keep it understandable).

import { Wasmer } from "@wasmer/sdk/browser";
import { AuthStore, authorizeUrl } from "./auth.js";
import { BridgeSession } from "./bridgeHost.js";
import { fetchToolModels } from "./models.js";
import {
    buildAuthJson,
    buildModelsJson,
    buildSettingsJson,
    DEFAULT_MODEL,
} from "./piConfig.js";
import {
    createSandbox,
    exportWorkspaceFiles,
    loadPiPackage,
    runPi,
    runShell,
    startPumpTransport,
    writeGuestFile,
} from "./sandbox.js";
import { createZip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const auth = new AuthStore(sessionStorage);

let sandbox = null;
let bridge = null;
let initPromise = null; // single-flight sandbox initialization
let running = false;
let stopRequested = false;
let currentRun = null; // { kill() } of the active Pi invocation
let hasSession = false;
let currentModel = DEFAULT_MODEL;
let catalogModelIds = [DEFAULT_MODEL];

const LOG_LINE_CAP = 2000; // drop oldest lines beyond this
const ANSWER_CAP = 1024 * 1024; // retained answer text budget
let answerTruncated = false;

function log(message, cls = "") {
    const box = $("log");
    const line = document.createElement("div");
    if (cls) line.className = cls;
    line.textContent =
        message.length > 4096 ? `${message.slice(0, 4096)}...` : message;
    box.appendChild(line);
    while (box.childNodes.length > LOG_LINE_CAP) box.firstChild.remove();
    box.scrollTop = box.scrollHeight;
}

// Append with a hard retained-size budget: a hostile or runaway run must
// not grow page memory without bounds.
function appendAnswer(text) {
    if (answerTruncated) return;
    const el = $("answer");
    if (el.textContent.length + text.length > ANSWER_CAP) {
        el.textContent += "\n[answer truncated - size limit]";
        answerTruncated = true;
        return;
    }
    el.textContent += text;
}

function setStatus(text) {
    $("status").textContent = text;
}

function refreshAuthUi() {
    const connected = Boolean(auth.getKey());
    $("auth-status").textContent = connected
        ? "connected - model requests spend YOUR Pollen"
        : "not connected";
    $("connect").disabled = connected;
    $("disconnect").disabled = !connected;
    $("run").disabled = !connected || running;
    $("refresh-models").disabled = !connected;
}

// Single-flight: concurrent callers share one initialization; partial
// failures clean up so a later call retries from scratch.
async function ensureSandbox() {
    if (sandbox && bridge) return;
    if (initPromise) return initPromise;
    initPromise = (async () => {
        let created = null;
        try {
            setStatus("starting sandbox");
            const wasmer = new Wasmer();
            const piPackage = await loadPiPackage(wasmer, (m) => setStatus(m));
            created = await createSandbox(wasmer, piPackage);
            setStatus("provisioning guest");
            await writeGuestFile(
                created,
                "/workspace/.pi/agent/models.json",
                JSON.stringify(buildModelsJson(catalogModelIds)),
            );
            await writeGuestFile(
                created,
                "/workspace/.pi/agent/auth.json",
                JSON.stringify(buildAuthJson()),
            );
            await writeGuestFile(
                created,
                "/workspace/.pi/agent/settings.json",
                JSON.stringify(buildSettingsJson(currentModel)),
            );
            const [bridgeSrc, pumpSrc] = await Promise.all([
                fetch("guest/bridge.mjs").then((r) => r.text()),
                fetch("guest/pump.mjs").then((r) => r.text()),
            ]);
            await writeGuestFile(
                created,
                "/workspace/.bridge/bridge.mjs",
                bridgeSrc,
            );
            await writeGuestFile(
                created,
                "/workspace/.bridge/pump.mjs",
                pumpSrc,
            );
            const transport = await startPumpTransport(created);
            bridge = new BridgeSession({
                transport,
                fetchImpl: fetch.bind(window),
                onAuthError: (err) => {
                    log(
                        `key rejected: ${err.message} - please reconnect`,
                        "err",
                    );
                    auth.clear();
                    bridge?.closeAdmission();
                    refreshAuthUi();
                },
                onProtocolError: (err) =>
                    log(`bridge protocol error: ${err.message}`, "err"),
            });
            sandbox = created;
            setStatus("sandbox ready");
        } catch (err) {
            bridge = null;
            if (created) {
                try {
                    await created.close();
                } catch {}
            }
            throw err;
        } finally {
            initPromise = null;
        }
    })();
    return initPromise;
}

async function stopActiveWork() {
    stopRequested = true;
    bridge?.closeAdmission();
    if (currentRun) await currentRun.kill().catch(() => {});
    if (sandbox)
        await runShell(sandbox, "rm -f /workspace/.bridge/*.req").catch(
            () => {},
        );
}

function renderEvent(event) {
    switch (event.type) {
        case "message_update": {
            const e = event.assistantMessageEvent;
            if (e?.type === "text_delta") appendAnswer(e.delta);
            break;
        }
        case "message_end":
            if (event.message?.role === "assistant") appendAnswer("\n");
            break;
        case "toolcall_start":
        case "tool_call_start":
            log(`> tool: ${event.toolName ?? event.name ?? "?"}`, "tool");
            break;
        case "turn_end": {
            for (const tr of event.toolResults ?? [])
                log(`> tool result: ${tr.toolName ?? "tool"}`, "tool");
            break;
        }
        case "agent_settled":
            log("run settled", "dim");
            break;
        default:
            break;
    }
}

async function onRun() {
    const prompt = $("prompt").value.trim();
    if (!prompt || running) return;
    running = true;
    stopRequested = false;
    $("run").disabled = true;
    $("stop").disabled = false;
    $("answer").textContent = "";
    answerTruncated = false;
    try {
        await ensureSandbox();
        if (stopRequested || !auth.getKey()) {
            log("run cancelled", "dim");
            return;
        }
        const runId = crypto.randomUUID();
        // the key is bound to this admission; replacing the key later does
        // not let old envelopes spend the new account
        bridge.openAdmission({
            runId,
            keyGen: auth.getKeyGen(),
            apiKey: auth.getKey(),
        });
        log(`you: ${prompt}`, "user");
        currentRun = runPi(sandbox, {
            model: currentModel,
            prompt,
            continueSession: hasSession,
            runId,
            keyGen: auth.getKeyGen(),
            onEvent: renderEvent,
        });
        const result = await currentRun.result;
        if (result.exitCode === 0) {
            hasSession = true;
            log("run finished", "dim");
        } else if (stopRequested) {
            log("run stopped", "dim");
        } else {
            log(
                `pi exited ${result.exitCode}: ${result.stderrTail.slice(-300)}`,
                "err",
            );
        }
    } catch (err) {
        log(`error: ${err.message}`, "err");
    } finally {
        bridge?.closeAdmission();
        currentRun = null;
        running = false;
        $("run").disabled = !auth.getKey();
        $("stop").disabled = true;
    }
}

async function onShell() {
    const cmd = $("shell").value.trim();
    if (!cmd) return;
    try {
        await ensureSandbox();
        log(`$ ${cmd}`, "user");
        const r = await runShell(sandbox, `cd /workspace && ${cmd}`);
        log(r.stdout + (r.stderr ? `\n${r.stderr}` : "") || `(exit ${r.code})`);
        if (r.outputKilled) log("(output truncated - command killed)", "err");
    } catch (err) {
        log(`shell error: ${err.message}`, "err");
    }
}

async function onExport() {
    try {
        await ensureSandbox();
        setStatus("exporting workspace");
        const { files, truncated } = await exportWorkspaceFiles(sandbox);
        const zip = createZip(
            files.map((f) => ({ name: f.name, data: f.data })),
        );
        const url = URL.createObjectURL(
            new Blob([zip], { type: "application/zip" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = "pi-workspace.zip";
        a.click();
        URL.revokeObjectURL(url);
        log(
            `exported ${files.length} files${truncated ? " (truncated at export limits)" : ""}: ${files.map((f) => f.name).join(", ")}`,
            "dim",
        );
        setStatus(`exported ${files.length} files`);
    } catch (err) {
        log(`export error: ${err.message}`, "err");
    }
}

async function provisionModelSelection() {
    if (!sandbox) return;
    await writeGuestFile(
        sandbox,
        "/workspace/.pi/agent/models.json",
        JSON.stringify(buildModelsJson(catalogModelIds)),
    );
    await writeGuestFile(
        sandbox,
        "/workspace/.pi/agent/settings.json",
        JSON.stringify(buildSettingsJson(currentModel)),
    );
}

async function onRefreshModels() {
    try {
        const models = await fetchToolModels(fetch.bind(window), auth.getKey());
        const select = $("model");
        select.innerHTML = "";
        if (models.length === 0) {
            const opt = document.createElement("option");
            opt.textContent = "no tool-calling models available";
            select.appendChild(opt);
            return;
        }
        for (const m of models) {
            const opt = document.createElement("option");
            opt.value = m.id;
            opt.textContent = m.title;
            select.appendChild(opt);
        }
        select.value = models.some((m) => m.id === DEFAULT_MODEL)
            ? DEFAULT_MODEL
            : models[0].id;
        currentModel = select.value;
        catalogModelIds = models.map((m) => m.id);
        select.onchange = async () => {
            currentModel = select.value;
            await provisionModelSelection().catch((err) =>
                log(`model provisioning failed: ${err.message}`, "err"),
            );
        };
        await provisionModelSelection().catch(() => {});
        log(`loaded ${models.length} tool-calling models`, "dim");
    } catch (err) {
        log(`model list failed: ${err.message}`, "err");
    }
}

function init() {
    const { connected, error } = auth.consumeFragment(location.hash, () =>
        history.replaceState(null, "", location.pathname + location.search),
    );
    if (error) log(`authorization failed: ${error}`, "err");
    if (connected) log("connected via Pollinations account", "dim");

    $("connect").onclick = () => {
        const state = auth.beginAuthorize();
        window.location.href = authorizeUrl(location.href.split("#")[0], state);
    };
    $("paste-connect").onclick = () => {
        const key = $("paste-key").value.trim();
        if (!key.startsWith("sk_")) {
            log("that does not look like a Pollinations key (sk_...)", "err");
            return;
        }
        $("paste-key").value = "";
        // replacing the key closes admission and aborts in-flight work so
        // old envelopes can never spend the new account's Pollen
        bridge?.closeAdmission();
        if (currentRun) currentRun.kill().catch(() => {});
        auth.setKey(key);
        refreshAuthUi();
    };
    $("disconnect").onclick = () => {
        auth.clear();
        bridge?.closeAdmission();
        if (currentRun) currentRun.kill().catch(() => {});
        refreshAuthUi();
        log("disconnected - key removed from this tab", "dim");
    };
    $("run").onclick = onRun;
    $("stop").onclick = async () => {
        await stopActiveWork();
        log("stop requested - admission closed, Pi terminated", "dim");
    };
    $("shell-go").onclick = onShell;
    $("export").onclick = onExport;
    $("refresh-models").onclick = onRefreshModels;
    refreshAuthUi();
    setStatus("idle - connect your Pollinations account to begin");
}

init();
