// App wiring: auth -> model catalog -> sandbox -> terminal + guided runs.
// The key lives in tab memory only. The guest never sees it: the bridge
// host (trusted side) adds Authorization when forwarding to gen.pollinations.ai.

import { Wasmer } from "@wasmer/sdk";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
    completeOAuth,
    startOAuth,
    validateApiKey,
    validateAppKey,
} from "./auth.js";
import { fetchAgentModels } from "./models.js";
import { DEFAULT_MODEL } from "./piConfig.js";
import {
    collectWorkspace,
    createSandbox,
    loadPiPackage,
    runPi,
    spawnTerminal,
    startBridge,
} from "./sandbox.js";
import { buildZip } from "./zip.js";

const $ = (id) => document.getElementById(id);
const setStatus = (text, kind = "") => {
    const el = $("status");
    el.textContent = text;
    el.className = `status ${kind}`;
};

const state = {
    apiKey: null,
    models: [],
    wasmer: null,
    sandbox: null,
    bridge: null,
    piPackage: null,
    terminal: null,
    termProc: null,
    fit: null,
    guidedRun: null,
    continueSession: false,
};

// ---------------- guided event rendering ----------------

function textOf(message) {
    if (!message?.content) return "";
    return message.content
        .filter((block) => block.type === "text")
        .map((block) => block.text)
        .join("");
}

function toolCallsOf(message) {
    if (!message?.content) return [];
    return message.content.filter((block) => block.type === "toolCall");
}

function addMessage(kind, label, text) {
    const stream = $("guided-stream");
    const div = document.createElement("div");
    div.className = `msg ${kind}`;
    if (label) {
        const l = document.createElement("span");
        l.className = "label";
        l.textContent = label;
        div.appendChild(l);
    }
    if (text) {
        const body = document.createElement("span");
        body.textContent = text;
        div.appendChild(body);
    }
    stream.appendChild(div);
    stream.scrollTop = stream.scrollHeight;
    return div;
}

// Renders one JSONL event from `pi --mode json`. Unknown shapes fall back
// to a compact raw line instead of crashing the stream.
function renderEvent(event) {
    const stream = $("guided-stream");
    switch (event?.type) {
        case "message_start": {
            if (event.message?.role === "user") {
                addMessage(
                    "user",
                    "you",
                    textOf(event.message) || "(non-text input)",
                );
            } else if (event.message?.role === "system") {
                // noise; do not render
            }
            break;
        }
        case "message_update": {
            const delta = event.assistantMessageEvent;
            if (delta?.type === "text_delta") {
                appendToAssistant(delta.delta ?? "");
            } else if (delta?.type === "toolcall_start") {
                appendToAssistant("");
                addMessage("tool", "tool call", delta.toolName ?? "tool");
            } else if (delta?.type === "toolcall_delta") {
                break;
            }
            break;
        }
        case "message_end": {
            if (event.message?.role === "assistant") {
                const tools = toolCallsOf(event.message);
                for (const call of tools) {
                    addMessage(
                        "tool",
                        "tool call",
                        `${call.name}(${summarizeArgs(call.arguments)})`,
                    );
                }
            }
            break;
        }
        case "tool_execution_start":
            addMessage(
                "tool",
                "running tool",
                `${event.toolName}(${summarizeArgs(event.args)})`,
            );
            break;
        case "tool_execution_end": {
            const result =
                typeof event.result === "object"
                    ? event.result
                    : { content: String(event.result ?? "") };
            const text =
                typeof result?.content === "string"
                    ? result.content
                    : textOf({ content: result?.content });
            addMessage(
                event.isError ? "error" : "tool",
                event.isError
                    ? "tool error"
                    : `tool result (${event.toolName})`,
                (text || "(empty)").slice(0, 4000),
            );
            break;
        }
        case "agent_end":
            appendToAssistant("\n");
            break;
        case "turn_start":
        case "turn_end":
        case "agent_start":
            break;
        case "error":
            addMessage(
                "error",
                "error",
                String(event.error ?? event.message ?? event),
            );
            break;
        default:
            addMessage("raw", "", JSON.stringify(event).slice(0, 400));
    }
    return stream;
}

let assistantDiv = null;
function appendToAssistant(text) {
    if (!text) return;
    const stream = $("guided-stream");
    const last = stream.lastElementChild;
    const isAssistant =
        last?.classList.contains("assistant") &&
        last?.dataset.live === "1" &&
        last === assistantDiv;
    if (isAssistant) {
        last.querySelector("span:last-child").textContent += text;
    } else {
        const div = addMessage("assistant", "pi", text);
        div.dataset.live = "1";
        assistantDiv = div;
    }
    stream.scrollTop = stream.scrollHeight;
}

function finalizeAssistant() {
    if (assistantDiv) {
        delete assistantDiv.dataset.live;
        assistantDiv = null;
    }
}

function summarizeArgs(args) {
    if (args == null) return "";
    if (typeof args === "string") return `"${args.slice(0, 80)}"`;
    try {
        const s = JSON.stringify(args) ?? "";
        return s.slice(1, -1).slice(0, 100);
    } catch {
        return String(args).slice(0, 80);
    }
}

// ---------------- guided runs ----------------

async function sendGuided() {
    if (state.guidedRun) return;
    const prompt = $("guided-prompt").value.trim();
    if (!prompt) return;
    const model = $("model-select").value || DEFAULT_MODEL;
    $("guided-prompt").value = "";
    finalizeAssistant();
    try {
        const run = runPi(state.sandbox, {
            model,
            prompt,
            continueSession: state.continueSession,
            onEvent: renderEvent,
        });
        state.guidedRun = run;
        $("btn-send").hidden = true;
        $("btn-stop").hidden = false;
        const result = await run.result;
        state.continueSession = true;
        $("guided-continue").checked = true;
        if (result.exitCode !== 0 && result.stderrTail) {
            addMessage("error", "pi exited non-zero", result.stderrTail);
        }
    } catch (err) {
        addMessage("error", "run failed", String(err?.message ?? err));
    } finally {
        finalizeAssistant();
        state.guidedRun = null;
        $("btn-send").hidden = false;
        $("btn-stop").hidden = true;
    }
}

// ---------------- terminal ----------------

async function startTerminalSession() {
    if (state.terminal) return;
    const term = new Terminal({
        cursorBlink: true,
        fontSize: 13,
        theme: { background: "#000000" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open($("terminal"));
    fit.fit();

    const model = $("model-select").value || DEFAULT_MODEL;
    setStatus("starting Pi terminal...");
    const proc = await spawnTerminal(state.sandbox, { model });
    state.termProc = proc;

    const decoder = new TextDecoder();
    (async () => {
        for await (const chunk of proc.stdout) {
            term.write(decoder.decode(new Uint8Array(chunk), { stream: true }));
        }
    })();
    (async () => {
        for await (const chunk of proc.stderr) {
            term.write(decoder.decode(new Uint8Array(chunk), { stream: true }));
        }
    })();
    term.onData((data) => {
        try {
            void proc.stdin?.write(data);
        } catch {}
    });

    window.addEventListener("resize", () => {
        try {
            fit.fit();
        } catch {}
    });
    term.onResize(({ cols, rows }) => {
        try {
            proc.resizeTerminal(cols, rows);
        } catch {}
    });
    proc.wait({ check: false })
        .then(() => {
            term.write(
                "\r\n\x1b[33m(Pi exited. Reload the page to start a new session.)\x1b[0m\r\n",
            );
            setStatus("pi exited", "err");
        })
        .catch(() => {});

    state.terminal = term;
    state.fit = fit;
    setStatus("ready - Pi is running in your browser", "ok");
    term.focus();
}

// ---------------- files ----------------

async function refreshFiles() {
    if (!state.sandbox) return;
    const tree = $("file-tree");
    const progress = $("file-progress");
    tree.textContent = "";
    progress.textContent = "reading workspace...";
    try {
        const { files, truncated } = await collectWorkspace(state.sandbox);
        const byPath = new Map();
        for (const f of files) byPath.set(f.path, f);
        const lines = [];
        for (const f of files) {
            if (f.type === "dir") {
                lines.push(`${f.path}/`);
            } else {
                const kb = f.content.length / 1024;
                lines.push(`${f.path}  (${kb.toFixed(1)} KB)`);
            }
        }
        tree.textContent =
            lines.length > 0
                ? lines.sort().join("\n")
                : "(workspace is empty - ask Pi to create something)";
        progress.textContent = truncated
            ? `${files.length} files shown (list truncated by safety caps)`
            : `${files.filter((f) => f.type === "file").length} files`;
        state.workspaceFiles = files.filter((f) => f.type === "file");
        $("btn-export").disabled = state.workspaceFiles.length === 0;
    } catch (err) {
        progress.textContent = `failed: ${err?.message ?? err}`;
    }
}

async function exportZip() {
    const files = state.workspaceFiles ?? [];
    if (files.length === 0) return;
    const encoder = new TextEncoder();
    const zip = buildZip(
        files.map((f) => ({
            path: f.path,
            bytes: encoder.encode(f.content),
        })),
    );
    const url = URL.createObjectURL(zip);
    const a = document.createElement("a");
    a.href = url;
    a.download = "pi-workspace.zip";
    a.click();
    URL.revokeObjectURL(url);
}

// ---------------- lifecycle ----------------

async function connect(apiKey) {
    state.apiKey = apiKey;
    setStatus("fetching model catalog...");
    const models = await fetchAgentModels();
    state.models = models;
    const select = $("model-select");
    select.hidden = false;
    for (const m of models) {
        const opt = document.createElement("option");
        opt.value = m.id;
        opt.textContent = `${m.id} (${Math.round(m.contextWindow / 1000)}k)`;
        if (m.id === DEFAULT_MODEL) opt.selected = true;
        select.appendChild(opt);
    }

    setStatus("initializing Wasmer runtime (first run downloads ~34 MB)...");
    state.wasmer = await Wasmer.create({ parallelism: 2 });
    state.piPackage = await loadPiPackage(state.wasmer, (msg) =>
        setStatus(msg),
    );

    setStatus("creating sandbox...");
    state.sandbox = await createSandbox({
        wasmer: state.wasmer,
        piPackage: state.piPackage,
        models,
        defaultModel: select.value || DEFAULT_MODEL,
    });

    state.bridge = await startBridge(state.sandbox, {
        apiKey,
        log: (msg) => console.info("[bridge]", msg),
    });

    $("connect-pane").hidden = true;
    $("work-pane").hidden = false;
    await startTerminalSession();
}

// ---------------- UI wiring ----------------

function wire() {
    $("btn-oauth").addEventListener("click", async () => {
        const appKey = validateAppKey($("app-key").value);
        if (!appKey) {
            setStatus(
                "enter an App Key (pk_...) to use OAuth, or paste an API key below",
                "err",
            );
            return;
        }
        sessionStorage.setItem("pi_oauth_client_id", appKey);
        const url = await startOAuth({
            clientId: appKey,
            redirectUri: `${location.origin}${location.pathname}`,
        });
        location.href = url;
    });

    $("btn-key").addEventListener("click", async () => {
        const key = validateApiKey($("api-key").value);
        if (!key) {
            setStatus("that does not look like an sk_... key", "err");
            return;
        }
        try {
            await connect(key);
        } catch (err) {
            setStatus(String(err?.message ?? err), "err");
        }
    });

    for (const tab of document.querySelectorAll("#tabs .tab")) {
        tab.addEventListener("click", () => {
            for (const t of document.querySelectorAll("#tabs .tab")) {
                t.classList.toggle("active", t === tab);
            }
            for (const body of document.querySelectorAll(".tab-body")) {
                body.hidden = body.id !== `tab-${tab.dataset.tab}`;
            }
            if (tab.dataset.tab === "terminal" && state.terminal) {
                state.fit.fit();
                state.terminal.focus();
            }
            if (tab.dataset.tab === "files") refreshFiles();
        });
    }

    $("btn-send").addEventListener("click", sendGuided);
    $("guided-prompt").addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
            ev.preventDefault();
            sendGuided();
        }
    });
    $("btn-stop").addEventListener("click", () => {
        state.guidedRun?.kill();
    });
    $("btn-export").addEventListener("click", exportZip);
}

async function boot() {
    wire();
    try {
        const token = await completeOAuth({ location });
        if (token) {
            await connect(token);
            return;
        }
    } catch (err) {
        setStatus(String(err?.message ?? err), "err");
    }
    setStatus("not connected");
}

boot();
