import { connectWallet, finishWallet } from "./auth.js";
import {
    API,
    authorizeRequest,
    DEFAULT_MODEL,
    mcpResult,
    projectEntries,
    projectPath,
    streamReceipt,
} from "./core.js";
import { Wasmer } from "./vendor/wasmer/dist/index.js";

const $ = (id) => document.getElementById(id);
const terminalPanel = $("pi-terminal-panel");
const fullscreenButton = $("pi-terminal-fullscreen");
function terminalFullscreen(active) {
    terminalPanel.classList.toggle("terminal-fullscreen", active);
    fullscreenButton.textContent = active
        ? "Exit fullscreen"
        : "Fullscreen terminal";
    fullscreenButton.setAttribute("aria-pressed", String(active));
}
function exitTerminalFullscreen() {
    if (!terminalPanel.classList.contains("terminal-fullscreen")) return false;
    if (document.fullscreenElement === terminalPanel) {
        document.exitFullscreen().catch((error) => status(error.message));
    } else terminalFullscreen(false);
    fullscreenButton.focus();
    return true;
}
fullscreenButton.onclick = handle(async () => {
    if (document.fullscreenElement === terminalPanel) {
        await document.exitFullscreen();
    } else if (terminalPanel.classList.contains("terminal-fullscreen")) {
        terminalFullscreen(false);
    } else {
        terminalFullscreen(true);
        if (document.fullscreenEnabled) {
            try {
                await terminalPanel.requestFullscreen();
            } catch {
                /* Embedded browsers can deny native fullscreen; the expanded view still works. */
            }
        }
    }
});
document.addEventListener("fullscreenchange", () => {
    terminalFullscreen(document.fullscreenElement === terminalPanel);
});
document.addEventListener(
    "keydown",
    (event) => {
        if (
            event.key === "Escape" &&
            terminalPanel.classList.contains("terminal-fullscreen")
        ) {
            event.preventDefault();
            event.stopPropagation();
            exitTerminalFullscreen();
        }
    },
    { capture: true },
);
let key = "";
let clientId = "";
let wasmer;
let sandbox;
let running = false;
let stopping = false;
let cancel;
let process;
let models = [];
const evidence = { pi: "0.87.1", sdk: "0.19.0", runs: [] };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (text) =>
    key ? String(text).replaceAll(key, "[redacted]") : String(text);
function status(text) {
    $("status").textContent = redact(text);
}
function activity(title, text) {
    $("activity").querySelector(".empty")?.remove();
    const entry = document.createElement("div");
    entry.className = "entry";
    const heading = document.createElement("strong");
    heading.textContent = title;
    entry.append(heading, document.createTextNode(redact(text)));
    $("activity").append(entry);
    $("activity").scrollTop = $("activity").scrollHeight;
}
function controls() {
    for (const id of ["import", "save", "preview", "shell-run"])
        $(id).disabled = !sandbox || running;
    for (const id of ["refresh", "export", "download-file"])
        $(id).disabled = !sandbox;
    $("save").disabled ||= $("editor").readOnly;
    for (const id of [
        "boot",
        "connect",
        "disconnect",
        "model",
        "exa",
        "computer",
        "budget",
        "calls",
        "key-file",
        "oauth",
    ])
        $(id).disabled = running;
    $("run").disabled = !sandbox || !key || running;
    $("oauth").disabled = running || !clientId;
    $("pi-terminal-start").disabled = !sandbox || running;
    $("stop").disabled = !running;
}
async function balance() {
    const response = await fetch(`${API}/account/balance`, {
        headers: { Authorization: `Bearer ${key}` },
        signal: cancel?.signal,
    });
    if (!response.ok)
        throw new Error(
            "The key needs balance access (usage permission), an available budget, and generation access.",
        );
    const result = await response.json();
    if (!Number.isFinite(result.balance))
        throw new Error("No valid account balance returned.");
    $("balance").textContent = `${result.balance.toFixed(6)} Pollen available`;
    return result.balance;
}
async function connect(value) {
    if (!value.startsWith("sk_") || value.length < 12)
        throw new Error(
            "Use your existing sk_ key, or authorize a wallet below.",
        );
    key = value;
    $("key").value = "";
    try {
        await balance();
        status("Pollinations connected. Your key is held only in this tab.");
    } catch (error) {
        key = "";
        throw error;
    } finally {
        controls();
    }
}
function handle(action) {
    return async (event) => {
        event?.preventDefault();
        try {
            await action(event);
        } catch (error) {
            status(error.message || String(error));
        }
    };
}
$("connect").onclick = handle(() => connect($("key").value.trim()));
$("disconnect").onclick = () => {
    key = "";
    $("key").value = "";
    $("key-file").value = "";
    $("balance").textContent = "Not connected";
    status("Disconnected. No credential was saved.");
    controls();
};
$("key-file").onchange = handle(async () => {
    const file = $("key-file").files[0];
    if (file.size > 1024)
        throw new Error("Choose a plain text key file under 1 KB.");
    await connect((await file.text()).trim());
    $("key-file").value = "";
});
$("oauth").onclick = handle(async () => {
    if (sandbox) await exportProject("pi-before-wallet-connect.zip");
    await connectWallet(clientId);
});
try {
    const token = await finishWallet();
    if (token) await connect(token);
} catch (error) {
    status(error.message);
}
try {
    const response = await fetch("./config.json");
    if (response.ok) {
        const config = await response.json();
        if (config.clientId?.startsWith("pk_")) {
            clientId = config.clientId;
            $("oauth-help").textContent =
                "Authorize Pi Workbench to use your own Pollen. Pollinations shows the app and requested access before you approve. Your current project is downloaded before leaving this page.";
        }
    }
} catch {
    /* No registered client in a local checkout. Existing-key connection works. */
}
controls();
function modelPrice() {
    const model = models.find((item) => item.name === $("model").value);
    const prices = model?.pricing;
    $("price").textContent = prices
        ? `Live base price / 1M tokens: ${(Number(prices.promptTextTokens) * 1e6).toFixed(3)} Pollen in · ${(Number(prices.completionTextTokens) * 1e6).toFixed(3)} out. Your key’s rates may differ.`
        : "See current pricing in the Pollinations dashboard.";
}
$("model").onchange = modelPrice;
try {
    const response = await fetch(`${API}/models`);
    models = (await response.json()).filter(
        (model) =>
            model.category === "text" &&
            model.tools &&
            // Pi's chat-completions adapter drops Gemini 3.8's tool-call signature on the next request.
            model.name !== "google/gemini-3.8-flash" &&
            model.supported_endpoints.includes("/v1/chat/completions"),
    );
    $("model").replaceChildren(
        ...models.map((model) => {
            const option = document.createElement("option");
            option.value = model.name;
            option.textContent = model.title || model.name;
            return option;
        }),
    );
    $("model").value = DEFAULT_MODEL;
    modelPrice();
} catch {
    $("model").options[0].textContent = "GPT-5.4 Nano (catalog unavailable)";
}
async function boot(files) {
    if (!crossOriginIsolated)
        throw new Error(
            "Browser isolation is still loading. Reload once, or use a browser supporting SharedArrayBuffer and service workers.",
        );
    $("boot").disabled = true;
    stopping = false;
    status("Loading real Pi and its WASIX runtime…");
    try {
        if (sandbox) await sandbox.close();
        if (wasmer) await wasmer.close();
        wasmer = new Wasmer({ parallelism: 2 });
        const [bridge, core] = await Promise.all([
            fetch("./guest-bridge.mjs").then((res) => res.text()),
            fetch("./core.js").then((res) => res.text()),
        ]);
        sandbox = await wasmer.sandboxes.create({
            packages: ["wasmer/pi@=0.87.1"],
            network: { mode: "disabled" },
            env: {
                HOME: "/workspace",
                PI_CODING_AGENT_DIR: "/workspace/.pi",
                PATH: "/bin:/usr/bin",
            },
            files: {
                ".pi/browser.mjs": bridge,
                ".pi/core.js": core,
                ".pi/settings.json": JSON.stringify({
                    enableInstallTelemetry: false,
                    enableAnalytics: false,
                }),
                ...(files || {
                    "hello.js": "console.log('Hello from browser Pi');\n",
                }),
            },
            onPackageProgress: (progress) =>
                status(
                    `Pi runtime: ${progress.phase} · ${(progress.download.downloadedBytes / 1048576).toFixed(1)} MiB downloaded`,
                ),
        });
        const version = await sandbox.command("pi", ["--version"]).run();
        if (version.text().trim() !== "0.87.1")
            throw new Error("Unexpected Pi package version.");
        await sandbox.fs.mkdir(".bridge", { recursive: true });
        activity(
            "SANDBOX",
            `Upstream Pi ${version.text().trim()} · local Bash + Node · network disabled`,
        );
        status(
            "Pi 0.87.1 is ready in your browser. Connect Pollinations, then ask Pi to build.",
        );
        $("boot").textContent = "Reset sandbox ↗";
        if (!stopping) await refresh();
    } finally {
        controls();
    }
}
$("boot").onclick = handle(() => boot());
async function projectFiles() {
    const files = {};
    for (const path of Object.keys(await projectEntries(sandbox.fs))) {
        const bytes = await sandbox.fs.readFile(path);
        try {
            files[path] = new TextDecoder("utf-8", { fatal: true }).decode(
                bytes,
            );
        } catch {
            files[path] = { binary: true, bytes: bytes.length };
        }
    }
    return files;
}
async function selectFile(path) {
    $("path").value = path;
    const bytes = await sandbox.fs.readFile(path);
    try {
        if (bytes.includes(0)) throw new Error("Binary file");
        $("editor").value = new TextDecoder("utf-8", { fatal: true }).decode(
            bytes,
        );
        $("editor").readOnly = false;
    } catch {
        $("editor").value =
            `Binary file · ${bytes.length.toLocaleString()} bytes. Use Download file to save the original bytes.`;
        $("editor").readOnly = true;
    }
    for (const button of $("files").querySelectorAll("button"))
        button.classList.toggle("selected", button.textContent === path);
    controls();
}
async function refresh() {
    const files = await projectEntries(sandbox.fs);
    $("files").replaceChildren(
        ...Object.keys(files)
            .sort()
            .map((path) => {
                const button = document.createElement("button");
                button.textContent = path;
                button.onclick = handle(() => selectFile(path));
                return button;
            }),
    );
    if (files[$("path").value] !== undefined) await selectFile($("path").value);
}
$("refresh").onclick = handle(refresh);
$("save").onclick = handle(async () => {
    const path = projectPath($("path").value);
    await sandbox.fs.writeText(path, $("editor").value);
    await refresh();
    status(`Saved ${path} in the browser sandbox.`);
});
$("preview").onclick = () => {
    $("preview-frame").srcdoc =
        `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:">${$("editor").value}`;
    $("preview-frame").hidden = false;
};
function downloadBytes(name, bytes, type = "application/octet-stream") {
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function download(name, value) {
    downloadBytes(name, JSON.stringify(value, null, 2), "application/json");
}
async function exportProject(name = "pi-project.zip") {
    const { zipSync } = await import("./vendor/fflate/browser.js");
    const files = {};
    for (const path of Object.keys(await projectEntries(sandbox.fs)))
        files[path] = await sandbox.fs.readFile(path);
    downloadBytes(name, zipSync(files, { level: 0 }), "application/zip");
}
$("export").onclick = handle(() => exportProject());
$("download-file").onclick = handle(async () => {
    const path = $("path").value;
    if (!Object.hasOwn(await projectEntries(sandbox.fs), path))
        throw new Error("Select a project file to download.");
    downloadBytes(path.split("/").at(-1), await sandbox.fs.readFile(path));
});
$("import").onchange = handle(async () => {
    const file = $("import").files[0];
    let files;
    if (file.name.endsWith(".zip")) {
        const { unzipSync } = await import("./vendor/fflate/browser.js");
        files = Object.fromEntries(
            Object.entries(
                unzipSync(new Uint8Array(await file.arrayBuffer())),
            ).filter(([path]) => !path.endsWith("/")),
        );
    } else files = JSON.parse(await file.text()).files;
    const entries = Object.entries(files);
    for (const [path, content] of entries) {
        projectPath(path);
        if (typeof content !== "string" && !(content instanceof Uint8Array))
            throw new Error("Project files must contain text or bytes.");
    }
    await boot(Object.fromEntries(entries));
    $("import").value = "";
});
$("shell-form").onsubmit = handle(async () => {
    const command = $("shell").value.trim();
    if (!sandbox || running || !command) return;
    running = true;
    controls();
    $("terminal").textContent = `$ ${command}\n`;
    try {
        process = await sandbox
            .command("bash", ["-lc", command])
            .spawn({ stdout: "pipe", stderr: "pipe", outputBytes: 131072 });
        const drain = async (stream) => {
            for await (const line of stream.lines())
                $("terminal").textContent += `${redact(line)}\n`;
        };
        await Promise.all([drain(process.stdout), drain(process.stderr)]);
        const result = await process.wait();
        if (!stopping) {
            $("terminal").textContent += `[exit ${result.exitCode}]`;
            await refresh();
        }
    } catch (error) {
        if (!stopping) throw error;
    } finally {
        process = null;
        running = false;
        controls();
    }
});
function eventMessage(event, run) {
    if (event.type === "tool_execution_start") {
        run.tools.push({
            id: event.toolCallId,
            name: event.toolName,
            arguments: event.args,
        });
        activity(`TOOL · ${event.toolName}`, JSON.stringify(event.args));
    }
    if (event.type === "tool_execution_end") {
        const text = (event.result?.content || [])
            .map((part) => part.text || "")
            .join("\n");
        const tool = run.tools.find((item) => item.id === event.toolCallId);
        if (tool) {
            tool.result = text;
            tool.isError = event.isError;
        }
        activity(`RESULT · ${event.toolName}`, text);
    }
    if (event.type === "message_end" && event.message.role === "assistant") {
        const message = event.message;
        const text = message.content
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join("\n");
        if (text) activity("PI", text);
        if (message.stopReason === "error" || message.stopReason === "aborted")
            run.error = message.errorMessage || message.stopReason;
        if (message.responseId)
            run.messages.push({
                responseId: message.responseId,
                usage: message.usage,
                stopReason: message.stopReason,
                text,
            });
    }
}
async function startPi(mode = "guided") {
    const interactive = mode === "terminal";
    const prompt = interactive
        ? "Interactive Pi terminal"
        : $("prompt").value.trim();
    if (!prompt || (!key && !interactive) || !sandbox || running) return;
    const limit = Number($("budget").value),
        calls = Number($("calls").value);
    if (
        !interactive &&
        (!Number.isFinite(limit) ||
            limit < 0.001 ||
            limit > 20 ||
            !Number.isInteger(calls) ||
            calls < 1 ||
            calls > 30)
    )
        throw new Error("Choose a valid stop budget and 1–30 API calls.");
    running = true;
    cancel = new AbortController();
    controls();
    const options = {
        mode,
        model: $("model").value,
        exa: $("exa").checked,
        computer: $("computer").checked,
    };
    const run = {
        startedAt: new Date().toISOString(),
        model: options.model,
        mode,
        prompt,
        optionalTools: { exa: options.exa, computer: options.computer },
        tools: [],
        messages: [],
        receipts: [],
    };
    evidence.runs.push(run);
    let pumping = true;
    let pump;
    let terminal;
    try {
        run.balanceBefore = key ? await balance() : null;
        const configured = (await sandbox.fs.readDir(".pi")).some(
            (entry) => entry.name === "models.json",
        );
        if (!configured)
            await sandbox.fs.writeText(
                ".pi/models.json",
                JSON.stringify({
                    providers: {
                        pollinations: {
                            baseUrl: `${API}/v1`,
                            api: "openai-completions",
                            apiKey: "browser-bridge",
                            compat: {
                                supportsStore: false,
                                supportsDeveloperRole: false,
                                supportsReasoningEffort: true,
                                supportsUsageInStreaming: true,
                                supportsStrictMode: false,
                                maxTokensField: "max_tokens",
                            },
                            models: (models.length
                                ? models
                                : [{ name: options.model }]
                            ).map((item) => ({
                                id: item.name,
                                name: item.title || item.name,
                                reasoning: !!item.reasoning,
                                input: item.input_modalities?.includes("image")
                                    ? ["text", "image"]
                                    : ["text"],
                                ...(item.context_length
                                    ? { contextWindow: item.context_length }
                                    : {}),
                                ...(item.max_completion_tokens
                                    ? { maxTokens: item.max_completion_tokens }
                                    : {}),
                                cost: {
                                    input:
                                        Number(
                                            item.pricing?.promptTextTokens || 0,
                                        ) * 1e6,
                                    output:
                                        Number(
                                            item.pricing
                                                ?.completionTextTokens || 0,
                                        ) * 1e6,
                                    cacheRead: 0,
                                    cacheWrite: 0,
                                },
                            })),
                        },
                    },
                }),
            );
        if (interactive) {
            const settings = JSON.parse(
                await sandbox.fs.readText(".pi/settings.json"),
            );
            if (!settings.defaultProvider) {
                settings.defaultProvider = "pollinations";
                settings.defaultModel = options.model;
                await sandbox.fs.writeText(
                    ".pi/settings.json",
                    JSON.stringify(settings),
                );
            }
        }
        await sandbox.fs.writeText(".pi/tools.json", JSON.stringify(options));
        let count = 0;
        let current = run.balanceBefore;
        pump = (async () => {
            while (pumping) {
                for (const entry of await sandbox.fs.readDir(".bridge")) {
                    if (!entry.name.endsWith(".request")) continue;
                    const path = `.bridge/${entry.name}`;
                    let result;
                    try {
                        if (cancel.signal.aborted)
                            throw new Error("Run stopped.");
                        if (!key)
                            throw new Error(
                                "Connect Pollinations before opening the terminal for model or MCP calls. Local commands need no key.",
                            );
                        const request = authorizeRequest(
                            JSON.parse(await sandbox.fs.readText(path)),
                            options,
                        );
                        ++count;
                        if (
                            !interactive &&
                            (count > calls ||
                                run.balanceBefore - current >= limit)
                        )
                            throw new Error(
                                "Run spending or API call limit reached.",
                            );
                        activity(
                            "API",
                            `${interactive ? `Terminal call ${count} · uncapped` : `Call ${count}/${calls}`} · ${request.kind} · ${request.body.model || request.kind}`,
                        );
                        const response = await fetch(request.url, {
                            method: "POST",
                            headers: {
                                Authorization: `Bearer ${key}`,
                                "Content-Type": "application/json",
                                Accept: "application/json, text/event-stream",
                                "MCP-Protocol-Version": "2025-03-26",
                            },
                            body: JSON.stringify(request.body),
                            signal: cancel.signal,
                        });
                        const body = redact(await response.text());
                        const type = response.headers.get("content-type") || "";
                        if (!response.ok)
                            throw new Error(
                                `Pollinations ${request.kind} returned HTTP ${response.status}. Check the key's allowed models and budget.`,
                            );
                        const receipt =
                            request.kind === "model"
                                ? streamReceipt(body)
                                : {
                                      tool: request.kind,
                                      result: mcpResult(body, type),
                                  };
                        current = await balance();
                        receipt.balanceAfter = current;
                        receipt.pollenSinceRunStart = Math.max(
                            0,
                            run.balanceBefore - current,
                        );
                        run.receipts.push(receipt);
                        activity(
                            "RECEIPT",
                            `${receipt.responseId || receipt.tool} · ${receipt.pollenSinceRunStart.toFixed(6)} Pollen used this run`,
                        );
                        result = {
                            status: response.status,
                            headers: { "content-type": type },
                            body,
                        };
                    } catch (error) {
                        result = {
                            error: redact(error.message || String(error)),
                        };
                        run.error = result.error;
                    }
                    await sandbox.fs.writeText(
                        path.replace(".request", ".response"),
                        JSON.stringify(result),
                    );
                    await sandbox.fs.remove(path);
                }
                await sleep(40);
            }
        })().catch(async (error) => {
            if (!stopping) {
                run.error = redact(error.message || String(error));
                await process?.kill();
            }
        });
        status(
            interactive
                ? "Real Pi terminal is open. Type /help, a prompt, or !node --version. /quit returns to the guided view."
                : "Pi is working inside the browser sandbox…",
        );
        activity("YOU", prompt);
        const args = [
            "--offline",
            "--extension",
            "/workspace/.pi/browser.mjs",
            "--session",
            "/workspace/.pi/session.jsonl",
        ];
        if (!interactive)
            args.push(
                "--provider",
                "pollinations",
                "--model",
                options.model,
                "--mode",
                "json",
                "-p",
                prompt,
            );
        if (interactive) $("pi-terminal-panel").hidden = false;
        process = await sandbox
            .command("pi", args, { env: { TERM: "xterm-256color" } })
            .spawn({
                stdout: "pipe",
                stderr: "pipe",
                outputBytes: 2 * 1024 * 1024,
                ...(interactive ? { terminal: { columns: 80, rows: 26 } } : {}),
            });
        if (interactive) {
            const { openPiTerminal } = await import("./pi-terminal.js");
            terminal = openPiTerminal(
                $("pi-terminal"),
                process,
                exitTerminalFullscreen,
            );
        }
        const stdout = (async () => {
            if (interactive) {
                const decoder = new TextDecoder();
                for await (const chunk of process.stdout) {
                    const text = redact(
                        decoder.decode(chunk, { stream: true }),
                    );
                    await terminal.write(text);
                }
                return;
            }
            for await (const line of process.stdout.lines()) {
                try {
                    eventMessage(JSON.parse(line), run);
                } catch {
                    activity("PI OUTPUT", line);
                }
            }
        })();
        const stderr = (async () => {
            if (interactive) {
                const decoder = new TextDecoder();
                for await (const chunk of process.stderr)
                    await terminal.write(
                        redact(decoder.decode(chunk, { stream: true })),
                    );
            } else
                for await (const line of process.stderr.lines())
                    activity("PI DIAGNOSTIC", line);
        })();
        await Promise.all([stdout, stderr]);
        const result = await process.wait();
        run.exitCode = result.exitCode;
        if (stopping) {
            run.error = "Stopped by user.";
            return;
        }
        if (!result.ok)
            run.error ||= `Pi exited with status ${result.exitCode}.`;
        run.files = await projectFiles();
        await refresh();
        status(
            run.error
                ? `Run stopped: ${run.error}`
                : interactive
                  ? "Pi terminal exited. Your project and conversation are available in the guided view."
                  : "Pi finished. Inspect the files, run a command, or ask a follow-up.",
        );
    } catch (error) {
        run.error = redact(error.message || String(error));
        if (!stopping) throw error;
    } finally {
        await terminal?.close();
        if (terminal) run.terminalOutput = terminal.output();
        pumping = false;
        if (pump) await pump;
        run.finishedAt = new Date().toISOString();
        process = null;
        cancel = null;
        running = false;
        controls();
    }
}
$("run").onclick = handle(() => startPi());
$("pi-terminal-start").onclick = handle(() => startPi("terminal"));
$("stop").onclick = handle(async () => {
    stopping = true;
    cancel?.abort();
    let exported = false;
    try {
        await exportProject("pi-stopped-project.zip");
        exported = true;
    } catch {
        /* Closing must still stop all guest descendants. */
    }
    const stoppedSandbox = sandbox;
    await stoppedSandbox.close();
    sandbox = null;
    running = false;
    controls();
    status(
        exported
            ? "Stopped the complete sandbox. Your project ZIP was downloaded; start a fresh sandbox and import it."
            : "Stopped the complete sandbox. Project export could not complete.",
    );
});
$("evidence").onclick = () => {
    $("evidence-panel").hidden = false;
    $("evidence-panel").open = true;
    $("evidence-json").textContent = redact(JSON.stringify(evidence, null, 2));
};
$("evidence-download").onclick = () =>
    download(
        "pi-run-evidence.json",
        JSON.parse(redact(JSON.stringify(evidence))),
    );
controls();
