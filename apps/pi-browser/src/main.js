// UI: load Pi once, connect a Pollinations account, then run Pi prompts and
// shell commands against the same in-browser project.

import { Wasmer } from "@wasmer/sdk";
import {
    DEFAULT_MODEL,
    ENTER,
    GEN,
    PROJECT,
    piArgs,
    providerConfig,
    toolModels,
} from "./core.js";
import { bootPi, serveBridge, writeProvider } from "./sandbox.js";

const $ = (id) => document.getElementById(id);
let apiKey = null; // memory only: never stored, never written into the sandbox
let sandbox = null;
let run = null;
let sessionId = crypto.randomUUID();

const status = (text) => {
    $("status").textContent = text;
};
const handle = (fn) => (event) => {
    event?.preventDefault?.();
    return fn(event).catch((error) => status(error.message ?? String(error)));
};

function update() {
    $("run").disabled = !(sandbox && apiKey) || Boolean(run);
    $("stop").disabled = !run;
    $("shell-run").disabled = !sandbox;
    $("connect").hidden = Boolean(apiKey);
    $("disconnect").hidden = !apiKey;
}

function line(text, className) {
    const el = document.createElement("div");
    el.textContent = text;
    if (className) el.className = className;
    $("log").append(el);
    el.scrollIntoView({ block: "nearest" });
    return el;
}

// --- Pi in the sandbox -----------------------------------------------------

async function boot() {
    const extension = await fetch("./guest/pollinations.mjs").then((r) =>
        r.text(),
    );
    const [models, box] = await Promise.all([
        fetch(`${GEN}/v1/models`)
            .then((r) => r.json())
            .then(({ data }) => toolModels(data)),
        bootPi(new Wasmer(), {
            extension,
            onProgress: ({ phase, download }) =>
                status(
                    `Loading Pi: ${phase}${download.percent == null ? "" : ` ${Math.round(download.percent)}%`}`,
                ),
        }),
    ]);
    await writeProvider(box, providerConfig(models));
    $("model").replaceChildren(
        ...models.map((m) => new Option(`${m.name} (${m.id})`, m.id)),
    );
    $("model").value = DEFAULT_MODEL;
    sandbox = box;
    status(apiKey ? "Ready." : "Pi is ready. Connect Pollinations to run it.");
    update();
    await refreshFiles();
}

// One rendering rule per Pi JSON event (see Pi's docs/json.md).
function render(event, state) {
    if (event.type === "message_update") {
        const e = event.assistantMessageEvent;
        if (e?.type !== "text_delta") return;
        state.text ??= line("", "assistant");
        state.text.textContent += e.delta;
    } else if (event.type === "message_end") {
        state.text = null;
        const { role, usage, errorMessage } = event.message;
        if (role !== "assistant") return;
        state.cost += usage?.cost?.total ?? 0;
        if (errorMessage) line(errorMessage, "error");
    } else if (event.type === "tool_execution_start") {
        const { command, path } = event.args ?? {};
        line(
            `▸ ${event.toolName} ${command ?? path ?? JSON.stringify(event.args)}`,
            "tool",
        );
    } else if (event.type === "tool_execution_end") {
        const text = (event.result?.content ?? [])
            .map((c) => c.text ?? "")
            .join("");
        if (text) line(text.slice(0, 4000), event.isError ? "error" : "meta");
    } else if (event.type === "auto_retry_start") {
        line(`Retrying: ${event.errorMessage}`, "meta");
    }
}

async function runPi() {
    const prompt = $("prompt").value.trim();
    if (!prompt) return;
    const controller = new AbortController();
    const proc = await sandbox
        .command("pi", piArgs({ model: $("model").value, prompt, sessionId }), {
            cwd: PROJECT,
        })
        .spawn({ stdout: "pipe", stderr: "capture" });
    run = { proc, controller };
    update();
    status("Pi is working…");
    line(`> ${prompt}`, "meta");
    const bridge = serveBridge(sandbox, {
        getKey: () => apiKey,
        fetch: (url, init) => fetch(url, init),
        signal: controller.signal,
    });
    const state = { text: null, cost: 0 };
    try {
        for await (const raw of proc.stdout.lines()) {
            try {
                render(JSON.parse(raw), state);
            } catch {
                line(raw, "meta");
            }
        }
        const out = await proc.wait({ check: false });
        const stderr = out.stderr.text().trim();
        if (out.exitCode !== 0 && stderr) line(stderr, "error");
        line(
            `Pi exited with ${out.exitCode} · ${state.cost.toFixed(6)} Pollen`,
            "meta",
        );
        status("Ready.");
    } finally {
        controller.abort();
        await bridge;
        run = null;
        update();
        await Promise.all([refreshFiles(), refreshBalance()]);
    }
}

// --- Files and shell -------------------------------------------------------

async function listFiles(dir) {
    const files = [];
    for (const entry of await sandbox.fs.readDir(dir)) {
        const path = `${dir}/${entry.name}`;
        if (entry.kind === "directory") files.push(...(await listFiles(path)));
        else files.push(path);
    }
    return files;
}

async function refreshFiles() {
    const items = (await listFiles(PROJECT)).sort().map((path) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = path.slice(PROJECT.length + 1);
        button.onclick = handle(async () => {
            $("file-view").textContent = await sandbox.fs
                .readText(path)
                .catch(() => "(binary file)");
        });
        const li = document.createElement("li");
        li.append(button);
        return li;
    });
    $("files").replaceChildren(...items);
}

async function runShell() {
    const out = await sandbox
        .command("bash", ["-c", $("shell").value], { cwd: PROJECT })
        .run({ check: false, timeoutMs: 120_000 });
    $("shell-out").textContent =
        `${out.stdout.text()}${out.stderr.text()}[exit ${out.exitCode}]`;
    await refreshFiles();
}

// --- Pollinations account --------------------------------------------------

async function useKey(key) {
    const response = await fetch(`${GEN}/account/balance`, {
        headers: { Authorization: `Bearer ${key}` },
    });
    if (response.status === 401)
        throw new Error("Pollinations rejected that key.");
    apiKey = key;
    $("key").value = "";
    $("device").hidden = true;
    update();
    await refreshBalance();
    status(sandbox ? "Ready." : "Connected. Pi is still loading…");
}

async function refreshBalance() {
    if (!apiKey) return;
    const response = await fetch(`${GEN}/account/balance`, {
        headers: { Authorization: `Bearer ${apiKey}` },
    });
    // Keys without the usage scope cannot read the balance; that is fine.
    $("account").textContent = response.ok
        ? `Connected · ${(await response.json()).balance.toFixed(4)} Pollen left`
        : "Connected";
}

// Device authorization keeps this tab (and the loaded sandbox) in place while
// the visitor approves the app in a Pollinations tab.
async function connect() {
    // Open the tab synchronously so popup blockers allow it.
    const tab = window.open("", "_blank");
    const code = await fetch(`${ENTER}/api/device/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scope: "usage" }),
    }).then((r) => r.json());
    $("user-code").textContent = code.user_code;
    $("device-link").href = code.verification_uri_complete;
    $("device").hidden = false;
    if (tab) {
        tab.opener = null;
        tab.location.href = code.verification_uri_complete;
    }
    const deadline = Date.now() + code.expires_in * 1000;
    while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, code.interval * 1000));
        const result = await fetch(`${ENTER}/api/device/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ device_code: code.device_code }),
        }).then((r) => r.json());
        if (result.access_token) return useKey(result.access_token);
        if (result.error !== "authorization_pending")
            throw new Error(`Authorization failed: ${result.error}`);
    }
    throw new Error("Authorization expired. Connect again.");
}

$("connect").onclick = handle(connect);
$("key-form").onsubmit = handle(() => useKey($("key").value.trim()));
$("disconnect").onclick = handle(async () => {
    apiKey = null;
    $("account").textContent = "";
    update();
});
$("run").onclick = handle(runPi);
$("stop").onclick = handle(async () => {
    run?.controller.abort();
    await run?.proc.kill();
});
$("new-session").onclick = handle(async () => {
    sessionId = crypto.randomUUID();
    $("log").replaceChildren();
});
$("refresh").onclick = handle(refreshFiles);
$("shell-form").onsubmit = handle(runShell);
update();
boot().catch((error) => status(`Could not start Pi: ${error.message}`));
