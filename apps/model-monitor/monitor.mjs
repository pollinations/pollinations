#!/usr/bin/env node

// Self-looping probe of all community models across request-type variants.
// Pushes live results to a `show --background` dashboard. Local-only, no deploy.
//
// Usage:
//   ENTER_API_TOKEN=sk_xxx node monitor.mjs
//
// The token is env-var-only (never a CLI flag) so it doesn't leak via `ps`/
// process listing on shared boxes.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
function argVal(name, fallback) {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? args[i + 1] : fallback;
}

const TOKEN = process.env.ENTER_API_TOKEN;
const INTERVAL_SEC = Number(argVal("interval", 180));
const GEN_URL = "https://gen.pollinations.ai/v1/chat/completions";
const MODELS_URL = "https://gen.pollinations.ai/models";
const RESULTS_PATH = join(__dirname, "results.json");
const HISTORY_LIMIT = 5; // sweeps kept per model+kind, for a mini trend

if (!TOKEN) {
    console.error("Missing token. Set ENTER_API_TOKEN in the environment.");
    process.exit(1);
}

const REQUEST_KINDS = [
    {
        key: "simple",
        label: "Short simple",
        build: (bust) => ({
            messages: [
                { role: "user", content: `Say OK and nothing else. [${bust}]` },
            ],
            max_tokens: 10,
            stream: false,
        }),
    },
    {
        key: "streaming",
        label: "Streaming",
        build: (bust) => ({
            messages: [
                { role: "user", content: `Count from 1 to 5. [${bust}]` },
            ],
            max_tokens: 40,
            stream: true,
        }),
    },
    {
        key: "json",
        label: "JSON response",
        build: (bust) => ({
            messages: [
                {
                    role: "user",
                    content: `Return a JSON object with keys "a" and "b" set to any short strings. Cache-bust: ${bust}`,
                },
            ],
            response_format: { type: "json_object" },
            max_tokens: 60,
            stream: false,
        }),
    },
    {
        key: "tool_call",
        label: "Tool call",
        build: (bust) => ({
            messages: [
                {
                    role: "user",
                    content: `What's the weather in Paris? Use the tool. [${bust}]`,
                },
            ],
            tools: [
                {
                    type: "function",
                    function: {
                        name: "get_weather",
                        description: "Get the current weather for a location",
                        parameters: {
                            type: "object",
                            properties: { location: { type: "string" } },
                            required: ["location"],
                        },
                    },
                },
            ],
            tool_choice: "auto",
            max_tokens: 60,
            stream: false,
        }),
    },
    {
        key: "large_coding",
        label: "Large coding prompt",
        build: (bust) => ({
            messages: [
                {
                    role: "user",
                    content: `Write a Python function that implements binary search on a sorted list, with type hints and a docstring. Include a short usage example. Cache-bust: ${bust}`,
                },
            ],
            max_tokens: 400,
            stream: false,
        }),
    },
];

function cacheBust() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function fetchCommunityModels() {
    const res = await fetch(MODELS_URL, {
        headers: { "User-Agent": "curl/8.7.1" },
    });
    if (!res.ok) throw new Error(`models fetch failed: ${res.status}`);
    const catalog = await res.json();
    return catalog
        .filter((m) => m.community === true && m.category === "text")
        .map((m) => m.name)
        .sort();
}

async function probeOne(model, kind) {
    const bust = cacheBust();
    const payload = { model: `community/${model}`, ...kind.build(bust) };
    const start = Date.now();
    const result = {
        model,
        kind: kind.key,
        label: kind.label,
        ts: new Date().toISOString(),
    };
    try {
        const res = await fetch(GEN_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
                "User-Agent": "curl/8.7.1",
                "Cache-Control": "no-cache",
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(20000),
        });
        result.status = res.status;
        if (payload.stream) {
            const reader = res.body.getReader();
            let bytes = 0,
                sawData = false,
                chunks = 0;
            while (bytes < 4000 && chunks < 30) {
                const { done, value } = await reader.read();
                if (done) break;
                bytes += value.length;
                chunks++;
                if (
                    !sawData &&
                    new TextDecoder().decode(value).includes("data:")
                )
                    sawData = true;
            }
            reader.cancel().catch(() => {});
            result.ok = res.ok && sawData;
            result.detail = sawData ? "sse ok" : "no sse data seen";
        } else {
            const text = await res.text();
            result.ok = res.ok;
            if (res.ok) {
                try {
                    const parsed = JSON.parse(text);
                    if (kind.key === "tool_call") {
                        const tc = parsed?.choices?.[0]?.message?.tool_calls;
                        result.ok = Boolean(tc);
                        result.detail = tc
                            ? "tool_calls returned"
                            : "no tool_calls in response";
                    } else if (kind.key === "json") {
                        const content =
                            parsed?.choices?.[0]?.message?.content ?? "";
                        try {
                            JSON.parse(content);
                            result.detail = "valid json content";
                        } catch {
                            result.ok = false;
                            result.detail = "content not valid json";
                        }
                    } else {
                        result.detail = "ok";
                    }
                } catch {
                    result.ok = false;
                    result.detail = "response not valid json";
                }
            } else {
                result.detail = text.slice(0, 200);
            }
        }
    } catch (err) {
        result.status = "ERR";
        result.ok = false;
        result.detail = `${err.name}: ${err.message}`;
    }
    result.latencyMs = Date.now() - start;
    return result;
}

function loadResults() {
    if (!existsSync(RESULTS_PATH))
        return { updatedAt: null, sweeps: 0, models: {} };
    try {
        return JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
    } catch {
        return { updatedAt: null, sweeps: 0, models: {} };
    }
}

function saveResults(state) {
    writeFileSync(RESULTS_PATH, JSON.stringify(state, null, 2));
}

function recordResult(state, result) {
    const { model, kind } = result;
    state.models[model] ??= {};
    state.models[model][kind] ??= [];
    const arr = state.models[model][kind];
    arr.push(result);
    while (arr.length > HISTORY_LIMIT) arr.shift();
}

let showProc = null;
let showPort = null;

function startShowDashboard() {
    const html = renderDashboardHtml(loadResults());
    showProc = spawn(
        "node",
        [join(process.env.HOME, ".claude/skills/show/show.js"), "--background"],
        { stdio: ["pipe", "pipe", "inherit"] },
    );
    showProc.stdin.write(html);
    showProc.stdin.end();
    showProc.stdout.on("data", (chunk) => {
        const line = chunk.toString();
        // show.js writes the bare port number to stdout (the "serving at"
        // message goes to stderr, which we inherit rather than capture).
        const m =
            line.match(/^(\d+)\s*$/) ||
            line.match(/(?:127\.0\.0\.1|localhost):(\d+)/);
        if (m) showPort = m[1];
        process.stdout.write(line);
    });
}

async function pushDashboardUpdate(state) {
    if (!showPort) {
        console.error("pushDashboardUpdate: showPort not set yet, skipping");
        return;
    }
    try {
        const res = await fetch(`http://127.0.0.1:${showPort}/content`, {
            method: "POST",
            headers: { "Content-Type": "text/html" },
            body: renderDashboardHtml(state),
        });
        if (!res.ok) {
            console.error(`pushDashboardUpdate: HTTP ${res.status}`);
        }
    } catch (err) {
        console.error(`pushDashboardUpdate failed: ${err.message}`);
    }
}

function statusBadge(result) {
    if (!result) return { text: "·", cls: "empty" };
    if (result.ok) return { text: "OK", cls: "ok" };
    if (result.status === "ERR") return { text: "ERR", cls: "fail" };
    return { text: String(result.status), cls: "fail" };
}

function renderDashboardHtml(state) {
    const models = Object.keys(state.models).sort();
    const kindHeaders = REQUEST_KINDS.map((k) => `<th>${k.label}</th>`).join(
        "",
    );
    const rows = models
        .map((model) => {
            const cells = REQUEST_KINDS.map((k) => {
                const arr = state.models[model][k.key] || [];
                const latest = arr[arr.length - 1];
                const badge = statusBadge(latest);
                const title = latest
                    ? `${latest.ts} · ${latest.latencyMs}ms · ${latest.detail || ""}`.replace(
                          /"/g,
                          "&quot;",
                      )
                    : "no data yet";
                const trend = arr.map((r) => (r.ok ? "●" : "○")).join("");
                return `<td><div class="cell ${badge.cls}" title="${title}">${badge.text}</div><div class="trend">${trend}</div></td>`;
            }).join("");
            return `<tr><td class="modelname">${model}</td>${cells}</tr>`;
        })
        .join("\n");

    const totalOk = models.reduce((acc, model) => {
        for (const k of REQUEST_KINDS) {
            const arr = state.models[model][k.key] || [];
            const latest = arr[arr.length - 1];
            if (latest?.ok) acc++;
        }
        return acc;
    }, 0);
    const totalCells = models.length * REQUEST_KINDS.length;

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>Community Model Monitor</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background:#0f1117; color:#e6e6e6; margin:0; padding:24px; }
  h1 { font-size: 18px; margin-bottom:2px; }
  .sub { color:#999; font-size:12px; margin-bottom:16px; }
  .stats { display:flex; gap:14px; margin-bottom:18px; }
  .stat { background:#181b24; border:1px solid #2a2e3a; border-radius:8px; padding:10px 16px; }
  .stat .val { font-size:22px; font-weight:700; }
  .stat .lbl { font-size:11px; color:#999; text-transform:uppercase; }
  table { border-collapse:collapse; width:100%; font-size:12.5px; }
  th { text-align:left; color:#999; font-weight:600; padding:5px 8px; border-bottom:1px solid #2a2e3a; font-size:10.5px; text-transform:uppercase; }
  td { padding:4px 8px; border-bottom:1px solid #1e212b; vertical-align:middle; }
  .modelname { font-family: ui-monospace, monospace; font-size:11.5px; white-space:nowrap; }
  .cell { display:inline-block; min-width:34px; text-align:center; border-radius:4px; padding:2px 6px; font-size:10px; font-weight:700; color:#0f1117; }
  .cell.ok { background:#2ecc71; }
  .cell.fail { background:#e74c3c; color:#fff; }
  .cell.empty { background:#1e212b; color:#555; }
  .trend { font-size:9px; color:#666; letter-spacing:1px; }
</style>
</head>
<body>
  <h1>Community Model Monitor</h1>
  <div class="sub">Sweep #${state.sweeps} · last updated ${state.updatedAt || "never"} · cache-busted, live probes every ${INTERVAL_SEC}s</div>
  <div class="stats">
    <div class="stat"><div class="val">${models.length}</div><div class="lbl">models</div></div>
    <div class="stat"><div class="val">${totalOk}/${totalCells}</div><div class="lbl">latest checks passing</div></div>
  </div>
  <table>
    <thead><tr><th>Model</th>${kindHeaders}</tr></thead>
    <tbody>${rows || '<tr><td colspan="7">Waiting for first sweep...</td></tr>'}</tbody>
  </table>
</body>
</html>`;
}

const CONCURRENCY = Number(argVal("concurrency", 6));

async function probeModel(model, state) {
    for (const kind of REQUEST_KINDS) {
        const result = await probeOne(model, kind);
        recordResult(state, result);
        console.log(
            `[${model}] ${kind.key}: ${result.ok ? "OK" : "FAIL"} status=${result.status} ${result.latencyMs}ms`,
        );
        saveResults(state);
        await pushDashboardUpdate(state);
    }
}

async function runSweep(state) {
    const models = await fetchCommunityModels();
    const queue = [...models];
    async function worker() {
        while (queue.length) {
            const model = queue.shift();
            if (model) await probeModel(model, state);
        }
    }
    await Promise.all(
        Array.from({ length: Math.min(CONCURRENCY, models.length) }, worker),
    );
    state.sweeps++;
    state.updatedAt = new Date().toISOString();
    saveResults(state);
    await pushDashboardUpdate(state);
}

const ONCE = args.includes("--once");

async function main() {
    const state = loadResults();

    if (ONCE) {
        // Single sweep for the EC2 Claude Code loop: generate fresh probe
        // traffic and write results.json, then exit. No dashboard — the loop
        // reads results.json directly, it doesn't watch a browser tab.
        console.log(
            `Running a single sweep: ${REQUEST_KINDS.length} request types per model.`,
        );
        await runSweep(state);
        return;
    }

    startShowDashboard();
    await new Promise((r) => setTimeout(r, 800)); // let show.js bind its port
    console.log(
        `Probing ${REQUEST_KINDS.length} request types per model, every ${INTERVAL_SEC}s. Ctrl-C to stop.`,
    );
    while (true) {
        try {
            await runSweep(state);
        } catch (err) {
            console.error("sweep failed:", err.message);
        }
        await new Promise((r) => setTimeout(r, INTERVAL_SEC * 1000));
    }
}

main();
