// UI orchestration: connect a Pollen key, boot the sandbox once, then let the
// visitor ask Pi to work on files.

import { PiSession } from "./sandbox.js";

const $ = (id) => document.getElementById(id);
const logEl = $("log");
const statusEl = $("status");
const keyEl = $("key");
const modelEl = $("model");
const runEl = $("run");
const connectEl = $("connect");

let session = null;
let booting = null;
let apiKey = null;

function log(line) {
    logEl.textContent += `\n${line}`;
    logEl.scrollTop = logEl.scrollHeight;
}

function setStatus(text, ok = false) {
    statusEl.textContent = text;
    statusEl.className = ok ? "badge ok" : "badge";
}

// Bring Your Own Pollen can hand the key back in the URL fragment, which never
// reaches a server. Pick it up so a redirect lands here ready to go.
function keyFromFragment() {
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const key = hash.get("api_key");
    if (key) {
        history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    return key;
}

async function connect() {
    apiKey = keyEl.value.trim() || apiKey;
    if (!apiKey) {
        log("Paste a Pollinations key first.");
        return;
    }
    sessionStorage.setItem("pi-web-key", apiKey);
    setStatus("booting", true);
    connectEl.disabled = true;
    runEl.disabled = true;
    try {
        booting = booting ?? bootSession();
        await booting;
        runEl.disabled = false;
        setStatus("ready", true);
    } catch (error) {
        setStatus("boot failed");
        log(`boot failed: ${error}`);
        booting = null;
        connectEl.disabled = false;
    }
}

async function bootSession() {
    session = new PiSession();
    await session.boot({
        apiKey,
        models: modelEl.value.trim() ? [{ id: modelEl.value.trim(), name: modelEl.value.trim(), contextWindow: 128000, input: ["text"] }] : undefined,
        onProgress: ({ phase, percent }) => {
            if (percent !== undefined) setStatus(`${phase} ${Math.round(percent)}%`);
        },
        onEvent: (event) => {
            if (event.type === "status") log(event.message);
            if (event.type === "request") log(`→ ${event.method} ${event.url}`);
            if (event.type === "response") log(`← ${event.status}`);
            if (event.type === "bridge-error") log(`bridge error: ${event.message}`);
        },
    });
}

async function run() {
    const prompt = $("prompt").value.trim();
    if (!prompt || !session) return;
    runEl.disabled = true;
    setStatus("working");
    log(`\n$ pi -p ${JSON.stringify(prompt)}`);
    try {
        const result = await session.run(prompt, {
            model: modelEl.value.trim() || undefined,
            onEvent: () => {},
        });
        if (result.stdout.trim()) log(result.stdout.trim().slice(-4000));
        if (result.stderr.trim()) log(`[stderr] ${result.stderr.trim().slice(-1500)}`);
        log(`exit ${result.exitCode} · ${result.events.length} json events`);
    } catch (error) {
        log(`run failed: ${error}`);
    } finally {
        runEl.disabled = false;
        setStatus("ready", true);
        await refreshFiles();
    }
}

async function refreshFiles() {
    if (!session) return;
    const entries = await session.listFiles("/workspace");
    const visible = entries.filter(
        (entry) => !entry.path.startsWith("/workspace/.pi") && !entry.path.startsWith("/workspace/.bridge"),
    );
    const list = $("files");
    list.replaceChildren();
    for (const entry of visible) {
        const item = document.createElement("li");
        item.textContent = entry.kind === "directory" ? `${entry.path}/` : `${entry.path}  (${entry.size}b)`;
        if (entry.kind === "file") {
            item.onclick = async () => {
                $("preview").textContent = await session.readText(entry.path);
            };
        }
        list.append(item);
    }
    if (!visible.length) log("(no files yet)");
}

connectEl.onclick = connect;
runEl.onclick = run;
$("refresh").onclick = refreshFiles;

// Small hook so the end-to-end test can drive the same code paths the UI uses.
window.piWeb = {
    connect,
    run,
    refreshFiles,
    get session() {
        return session;
    },
};

const fragmentKey = keyFromFragment();
if (fragmentKey) {
    keyEl.value = fragmentKey;
    apiKey = fragmentKey;
    log("Picked up a key from the URL fragment. Press Connect.");
} else {
    const saved = sessionStorage.getItem("pi-web-key");
    if (saved) {
        keyEl.value = saved;
        log("Restored the key for this tab. Press Connect.");
    }
}
