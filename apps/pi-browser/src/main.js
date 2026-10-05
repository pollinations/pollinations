import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import {
    finishConnect,
    forgetToken,
    loadToken,
    saveToken,
    startConnect,
} from "./auth.js";
import { BRIDGE_DIR, pumpLoop } from "./bridge.js";
import { fetchPiModels, GEN_ORIGIN } from "./catalog.js";
import { createSandbox, startPi, wireTerminal } from "./session.js";

const $ = (id) => document.getElementById(id);
const isoPill = $("iso-pill");
const authPill = $("auth-pill");
const fileBox = $("files");
const logBox = $("log");
const runButton = $("run");
const stopButton = $("stop");

let session = null;
let key = loadToken();
let models = [];

const terminal = new Terminal({
    fontSize: 13,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    theme: { background: "#101014", foreground: "#e8e8e8", cursor: "#6f5dff" },
});
const fit = new FitAddon();
terminal.loadAddon(fit);
terminal.open($("terminal"));
fit.fit();
let fitTimer = null;
new ResizeObserver(() => {
    clearTimeout(fitTimer);
    fitTimer = setTimeout(() => fit.fit(), 50);
}).observe($("terminal"));

function renderAuth() {
    authPill.textContent = key
        ? "connected · your Pollen"
        : "guest tier (no key)";
    authPill.className = `pill${key ? " ok" : ""}`;
    runButton.disabled = !$("model").value;
}

function renderIso() {
    if (window.crossOriginIsolated) {
        isoPill.textContent = "cross-origin isolated";
        isoPill.className = "pill ok";
        return;
    }
    isoPill.textContent = "not isolated — sandbox cannot start";
    isoPill.className = "pill warn";
}

function logLine(text) {
    if (logBox.querySelector("em")) logBox.textContent = "";
    const line = document.createElement("div");
    line.textContent = text;
    logBox.prepend(line);
    while (logBox.childElementCount > 60) logBox.lastChild.remove();
}

async function loadModels() {
    const select = $("model");
    try {
        models = await fetchPiModels();
    } catch (error) {
        select.innerHTML = `<option value="">catalog unavailable (${String(error.message ?? error)})</option>`;
        return;
    }
    select.innerHTML = models
        .map(
            (model) =>
                `<option value="${model.id}">${model.id} — ${model.title}</option>`,
        )
        .join("");
    const preferred = models.find(
        (model) => model.id === "openai/gpt-5.4-mini",
    );
    if (preferred) select.value = preferred.id;
    renderAuth();
}

async function refreshFiles(sandbox) {
    try {
        const entries = await sandbox.fs.readDir("/workspace");
        const names = entries
            .map((entry) => (typeof entry === "string" ? entry : entry.name))
            .filter((name) => !name.startsWith("."))
            .sort();
        if (!names.length) {
            fileBox.innerHTML = "<em>Pi writes files here.</em>";
            return;
        }
        fileBox.innerHTML = "";
        for (const name of names) {
            const button = document.createElement("button");
            button.textContent = name;
            button.onclick = async () => {
                const existing = fileBox.querySelector(
                    `[data-preview="${CSS.escape(name)}"]`,
                );
                if (existing) {
                    existing.remove();
                    return;
                }
                try {
                    const text = await sandbox.fs.readText(
                        `/workspace/${name}`,
                    );
                    const pre = document.createElement("pre");
                    pre.dataset.preview = name;
                    pre.textContent = text.slice(0, 8000);
                    button.after(pre);
                } catch (error) {
                    logLine(`read ${name}: ${String(error.message ?? error)}`);
                }
            };
            fileBox.append(button);
        }
    } catch (error) {
        logLine(`files: ${String(error.message ?? error)}`);
    }
}

async function run() {
    const model = $("model").value;
    const prompt = $("prompt").value.trim();
    if (!model) return;
    renderIso();
    if (!window.crossOriginIsolated) {
        terminal.writeln(
            "\r\n\x1b[33mThis page is not cross-origin isolated; serve it with COOP/COEP (see README).\x1b[0m",
        );
        return;
    }

    runButton.disabled = true;
    stopButton.disabled = false;
    terminal.clear();
    terminal.writeln(`\x1b[35mstarting ${model} in a Wasmer sandbox…\x1b[0m`);

    try {
        const { wasmer, sandbox } = await createSandbox({
            models,
            model,
        });
        const controller = new AbortController();
        const events = pumpLoop({
            fs: sandbox.fs,
            key,
            genOrigin: GEN_ORIGIN,
            signal: controller.signal,
            onEvent: (event) =>
                logLine(
                    `${event.error ? "!" : event.status} ${event.method} ${new URL(event.url).pathname}`,
                ),
            onLoopError: (error) =>
                logLine(`bridge: ${String(error.message ?? error)}`),
        });

        const process = await startPi(sandbox, {
            model,
            columns: terminal.cols,
            rows: terminal.rows,
        });
        await wireTerminal(process, terminal);

        const filesTimer = setInterval(() => void refreshFiles(sandbox), 2000);
        void refreshFiles(sandbox);

        // Hand Pi the task the way a person would: type it into the terminal
        // once its own UI is up, then press Enter. The e2e script opts out
        // (?noautotype=1) so it can drive the terminal itself, deterministically.
        const noAutoType = new URLSearchParams(location.search).has(
            "noautotype",
        );
        if (prompt && !noAutoType) {
            setTimeout(() => {
                void process.stdin.write(prompt);
                setTimeout(() => {
                    void process.stdin.write("\r");
                    terminal.writeln(`\r\n\x1b[36m→ ${prompt}\x1b[0m`);
                }, 700);
            }, 4000);
        }

        const exited = process
            .wait()
            .catch((error) => ({ error }))
            .finally(() => {
                clearInterval(filesTimer);
            });

        session = {
            wasmer,
            sandbox,
            process,
            controller,
            events,
            exited,
            async stop() {
                controller.abort();
                clearInterval(filesTimer);
                try {
                    await process.kill();
                } catch {}
                try {
                    await wasmer.close();
                } catch {}
            },
        };
        void exited.then(() => {
            if (session && session.process === process) endSession("Pi exited");
        });
    } catch (error) {
        terminal.writeln(
            `\r\n\x1b[31m${String(error.message ?? error)}\x1b[0m`,
        );
        logLine(`start: ${String(error.message ?? error)}`);
        session = null;
        stopButton.disabled = true;
        renderAuth();
    }
}

async function endSession(reason) {
    const current = session;
    session = null;
    stopButton.disabled = true;
    if (current) {
        current.controller.abort();
        try {
            await current.wasmer.close();
        } catch {}
    }
    renderAuth();
    if (reason) logLine(reason);
    renderAuth();
}

$("run").onclick = run;
$("stop").onclick = () => void endSession("stopped");
$("model").onchange = renderAuth;

const usePastedKey = (event) => {
    const value = event.target.value.trim();
    if (!value) return;
    key = saveToken(value);
    event.target.value = "";
    renderAuth();
};
$("key").addEventListener("change", usePastedKey);
$("key").addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    usePastedKey(event);
    event.target.value = "";
});

$("connect").onclick = () => {
    const clientId = $("client-id").value.trim();
    if (!clientId) {
        authPill.textContent = "paste an App key (pk_…) first";
        authPill.className = "pill warn";
        return;
    }
    void startConnect({ clientId });
};

window.addEventListener("DOMContentLoaded", async () => {
    renderIso();
    renderAuth();
    await loadModels();
    // Coming back from the consent screen.
    if (window.location.search.includes("code=")) {
        const clientId = $("client-id").value.trim();
        const result = await finishConnect(window.location.search, {
            clientId: clientId || undefined,
        });
        if (result.ok) {
            key = result.token;
            logLine("connected: Pollinations wallet linked");
        } else if (result.error) {
            authPill.textContent = result.error;
            authPill.className = "pill warn";
        }
        renderAuth();
    }
    window.__piBrowser = {
        get session() {
            return session;
        },
        get bridgeDir() {
            return BRIDGE_DIR;
        },
        forget: () => {
            forgetToken();
            key = null;
            renderAuth();
        },
    };
});
