// Agent dashboard: one local page listing every herdr agent pane with its live
// status, its card (written by the thread itself with dash-status into status/,
// or by the coordinator in state.json; the newer one wins), the thread's latest
// answer and history (read from its Claude/Codex session file), and a reply box
// that types messages into the thread with `herdr agent prompt`.
//
//   node server.mjs            serve on 127.0.0.1:7320 and open a Chrome app window
//   node server.mjs --no-open  serve only

import { execFile, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const DIR = path.dirname(new URL(import.meta.url).pathname);
const STATUS_DIR = path.join(DIR, "status");
const PORT = 7320;
const ORIGIN = `http://127.0.0.1:${PORT}`;
// kept on disk so an open page can still send after a server restart
const TOKEN_FILE = path.join(DIR, ".token");
if (!fs.existsSync(TOKEN_FILE))
    fs.writeFileSync(TOKEN_FILE, crypto.randomBytes(16).toString("hex"), {
        mode: 0o600,
    });
const TOKEN = fs.readFileSync(TOKEN_FILE, "utf8").trim();
const CODEX_DB = path.join(os.homedir(), ".codex/state_5.sqlite");
const CLAUDE_PROJECTS = path.join(os.homedir(), ".claude/projects");
const SENT_FILE = path.join(DIR, "sent.json");
const TAIL_BYTES = 16 * 1024 * 1024; // about a day of the busiest session

// ---------- herdr ----------

const labels = {}; // pane -> herdr pane label (refreshed every minute)
let labelsAt = 0;

async function herdrAgents() {
    const { stdout } = await run("herdr", ["agent", "list"], {
        maxBuffer: 1 << 24,
    });
    const d = JSON.parse(stdout);
    const agents = d.result?.agents ?? d.agents ?? [];
    if (Date.now() - labelsAt > 60_000) {
        labelsAt = Date.now();
        await Promise.all(
            agents.map(async (a) => {
                try {
                    const r = await run("herdr", ["pane", "get", a.pane_id]);
                    labels[a.pane_id] =
                        JSON.parse(r.stdout).result?.pane?.label ?? "";
                } catch {}
            }),
        );
    }
    return agents.map((a) => ({
        pane: a.pane_id,
        status: a.agent_status,
        kind: a.agent,
        session: a.agent_session?.value ?? null,
        title: a.terminal_title_stripped ?? "",
        label: labels[a.pane_id] ?? "",
        cwd: a.cwd ?? "",
    }));
}

// Claude Code's question dialogs (AskUserQuestion) leave the pane "done" in
// herdr, and typing into one answers it, so check the bottom of the screen.
const dialogs = new Map(); // pane -> {at, d}

async function openDialog(pane, fresh) {
    const c = dialogs.get(pane);
    if (!fresh && c && Date.now() - c.at < 4000) return c.d;
    let d = null;
    try {
        const { stdout } = await run(
            "herdr",
            ["pane", "read", pane, "--source", "visible"],
            { maxBuffer: 1 << 22 },
        );
        // a pane read can include the neighbouring pane after a │ border
        const lines = stdout
            .split("\n")
            .map((l) => l.split(/\s*│/)[0].trimEnd())
            .filter((l) => l.trim());
        const foot = lines.findLastIndex(
            (l, i) =>
                i >= lines.length - 4 &&
                /Enter to (select|continue).*Esc to cancel/.test(l),
        );
        if (foot >= 0) {
            const opt = lines.findLastIndex(
                (l, i) => i < foot && /^\s*(❯\s*)?1\.\s/.test(l),
            );
            const q =
                opt > 0
                    ? lines
                          .slice(0, opt)
                          .findLast((l) => !/^\s*[─←]/.test(l))
                          ?.trim()
                    : null;
            d = {
                q: q ?? "a question",
                tabs:
                    opt > 0
                        ? (lines
                              .slice(Math.max(0, opt - 4), opt)
                              .find((l) => l.trim().startsWith("←"))
                              ?.trim() ?? null)
                        : null,
            };
        }
    } catch {}
    dialogs.set(pane, { at: Date.now(), d });
    return d;
}

// ---------- session files ----------

const fileCache = new Map(); // session id -> path

async function sessionFile(kind, id) {
    if (!id) return null;
    if (fileCache.has(id)) return fileCache.get(id);
    let f = null;
    if (kind === "codex") {
        try {
            const { stdout } = await run("sqlite3", [
                CODEX_DB,
                `select rollout_path from threads where id='${id.replace(/[^0-9a-f-]/gi, "")}'`,
            ]);
            f = stdout.trim() || null;
        } catch {}
    } else {
        for (const p of fs.readdirSync(CLAUDE_PROJECTS)) {
            const c = path.join(CLAUDE_PROJECTS, p, `${id}.jsonl`);
            if (fs.existsSync(c)) {
                f = c;
                break;
            }
        }
    }
    if (f) fileCache.set(id, f);
    return f;
}

function readLines(file, tailOnly) {
    const size = fs.statSync(file).size;
    const start = tailOnly ? Math.max(0, size - TAIL_BYTES) : 0;
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    const lines = buf.toString("utf8").split("\n");
    if (start > 0) lines.shift(); // partial first line
    return lines;
}

const NOISE = [
    "<command-name>",
    "<local-command",
    "<bash-",
    "Caveat:",
    "[Request interrupted",
    "<task-notification>",
    "<environment_context>",
    "# AGENTS.md",
    "<user_instructions>",
    "<INSTRUCTIONS>",
    "<turn_aborted>",
    "<system-reminder>",
    "This session is being continued",
];
const isNoise = (t) =>
    !t.trim() || NOISE.some((n) => t.trimStart().startsWith(n));
// Claude Code wraps long typed messages (like the dashboard's) in these tags
const unwrap = (t) => t.replace(/<\/?pasted_content[^>]*>/g, "").trim();

function toolLine(name, input) {
    let i = input;
    if (typeof i === "string") {
        try {
            i = JSON.parse(i);
        } catch {
            return `${name}: ${i}`;
        }
    }
    const s =
        i?.description ||
        i?.command ||
        i?.cmd ||
        i?.file_path ||
        i?.path ||
        i?.pattern ||
        i?.url ||
        i?.query ||
        i?.prompt ||
        "";
    return `${name}${s ? ": " + String(Array.isArray(s) ? s.join(" ") : s) : ""}`.slice(
        0,
        220,
    );
}

// Codex's code mode runs every tool through one "exec" call; name it after the
// first tool the code calls, and show the shell command when there is one.
function codexTool(name, input) {
    const inner =
        name === "exec" &&
        typeof input === "string" &&
        input.match(/tools\.(\w+)\(/)?.[1];
    if (!inner) return { name, text: toolLine(name, input) };
    const cmd = input.match(/cmd:\s*"((?:[^"\\]|\\.)*)"/)?.[1];
    return {
        name: inner,
        text: `${inner}${cmd ? ": " + cmd.replace(/\\n/g, " ").replace(/\\"/g, '"') : ""}`.slice(
            0,
            220,
        ),
    };
}

// Turns a session file into events: {t:'prompt'|'answer'|'tool', ts, text}
function events(kind, lines) {
    const out = [];
    for (const l of lines) {
        if (!l) continue;
        let d;
        try {
            d = JSON.parse(l);
        } catch {
            continue;
        }
        const ts = d.timestamp ?? null;
        if (kind === "codex") {
            const p = d.payload;
            if (d.type !== "response_item" || !p) continue;
            if (
                p.type === "message" &&
                (p.role === "user" || p.role === "assistant")
            ) {
                const text = (p.content ?? [])
                    .map((c) => c.text ?? "")
                    .join("\n");
                if (p.role === "user" && isNoise(text)) continue;
                out.push({
                    t: p.role === "user" ? "prompt" : "answer",
                    ts,
                    text,
                });
            } else if (
                p.type === "custom_tool_call" ||
                p.type === "function_call"
            ) {
                out.push({
                    t: "tool",
                    ts,
                    ...codexTool(p.name, p.input ?? p.arguments),
                });
            }
        } else {
            const m = d.message;
            if (!m || d.isMeta || d.isCompactSummary) continue;
            if (d.type === "user") {
                if (
                    Array.isArray(m.content) &&
                    m.content.some((c) => c.type === "tool_result")
                )
                    continue;
                const text =
                    typeof m.content === "string"
                        ? m.content
                        : (m.content ?? [])
                              .filter((c) => c.type === "text")
                              .map((c) => c.text)
                              .join("\n");
                if (isNoise(text)) continue;
                out.push({ t: "prompt", ts, text: unwrap(text) });
            } else if (d.type === "assistant" && Array.isArray(m.content)) {
                for (const c of m.content) {
                    if (c.type === "text" && c.text.trim())
                        out.push({ t: "answer", ts, text: c.text });
                    if (c.type === "tool_use")
                        out.push({
                            t: "tool",
                            ts,
                            name: c.name,
                            text: toolLine(c.name, c.input),
                        });
                }
            }
        }
    }
    return out;
}

// Tool kinds, drawn as coloured squares on the dashboard
const KINDS = [
    ["edit", /^(Edit|Write|MultiEdit|NotebookEdit|apply_patch)$/],
    ["read", /^(Read|Grep|Glob|LS|ToolSearch|view_image)$/],
    ["web", /web|browser|playwright|fetch/i],
    [
        "agent",
        /^(Agent|Task|Workflow|SendMessage|TodoWrite|update_plan|spawn_agent)/,
    ],
    ["shell", /^(Bash|exec_command|shell|local_shell|write_stdin|Monitor)$/],
];
const toolKind = (name) =>
    KINDS.find(([, re]) => re.test(name ?? ""))?.[0] ?? "other";

// Groups events into turns: the prompt, the last answer after it, tool count,
// and the kinds of the last 40 tool calls.
function turns(evs) {
    const res = [];
    let cur = null;
    const turn = (e, prompt) => ({
        ts: e.ts,
        prompt,
        answer: null,
        answerTs: null,
        tools: 0,
        trail: [],
        last: null,
    });
    for (const e of evs) {
        if (e.t === "prompt") {
            cur = turn(e, e.text);
            res.push(cur);
            continue;
        }
        if (!cur) {
            cur = turn(e, "");
            res.push(cur);
        }
        if (e.t === "answer") {
            cur.answer = e.text;
            cur.answerTs = e.ts;
        }
        if (e.t === "tool") {
            cur.tools++;
            cur.trail.push({ k: toolKind(e.name), t: e.text.slice(0, 140) });
            if (cur.trail.length > 40) cur.trail.shift();
        }
        cur.last = e;
    }
    return res;
}

const DAY = 24 * 3600_000;
const GAP = 10 * 60_000; // quiet this long and a turn is drawn as two bars
const norm = (t) => t.replace(/\s+/g, " ").trim().slice(0, 200);

// Who started each stretch of work: Thomas from the dashboard, the coordinator,
// someone typing in the pane, or the thread itself carrying on after a pause.
function who(text, mine) {
    if (mine.has(norm(text))) return "dash";
    if (/^From (the coordinator|Thomas)\b/.test(text)) return "coord";
    return "term";
}

// Bars for the activity timeline over the last day: {s, e, by, n steps, p prompt}
function segments(evs, mine) {
    const out = [];
    let cur = null;
    let prev = 0;
    for (const e of evs) {
        const ms = Date.parse(e.ts);
        if (!ms) continue;
        if (e.t === "prompt")
            out.push(
                (cur = {
                    s: ms,
                    e: ms,
                    by: who(e.text, mine),
                    n: 0,
                    p:
                        e.text
                            .split("\n")
                            .find((x) => x.trim())
                            ?.slice(0, 120) ?? "",
                }),
            );
        else if (!cur || ms - prev > GAP)
            out.push((cur = { s: ms, e: ms, by: "self", n: 0, p: "" }));
        cur.e = ms;
        if (e.t === "tool") cur.n++;
        prev = ms;
    }
    const since = Date.now() - DAY;
    return out.filter((s) => s.e >= since);
}

// Session files only grow, so each one is parsed once (from TAIL_BYTES before
// the end) and after that only its new lines are read.
const evCache = new Map(); // file -> {offset, skipFirst, evs, data}

function fileEvents(kind, file) {
    const size = fs.statSync(file).size;
    let c = evCache.get(file);
    if (!c || size < c.offset)
        evCache.set(
            file,
            (c = {
                offset: Math.max(0, size - TAIL_BYTES),
                skipFirst: size > TAIL_BYTES,
                evs: [],
                data: null,
            }),
        );
    if (size === c.offset) return c;
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(size - c.offset);
    fs.readSync(fd, buf, 0, buf.length, c.offset);
    fs.closeSync(fd);
    const end = buf.lastIndexOf(10); // whole lines only; one still being written waits for the next read
    if (end < 0) return c;
    const lines = buf.subarray(0, end).toString("utf8").split("\n");
    if (c.skipFirst) {
        lines.shift();
        c.skipFirst = false;
    } // started mid-line
    c.offset += end + 1;
    c.evs = c.evs.concat(events(kind, lines));
    c.data = null;
    return c;
}

function live(kind, file, mine) {
    const c = fileEvents(kind, file);
    if (c.data) return c.data;
    const evs = c.evs;
    const ts = turns(evs);
    const last = ts.at(-1) ?? null;
    // the latest substantial answer, so a short "ok" doesn't hide the report
    const report =
        [...ts].reverse().find((t) => t.answer && t.answer.length > 200) ??
        last;
    const since = Math.floor((Date.now() - DAY) / 60_000);
    const mins = new Map(); // minute -> events, for the activity strips
    for (const e of evs) {
        const m = Math.floor(Date.parse(e.ts) / 60_000);
        if (m >= since) mins.set(m, (mins.get(m) ?? 0) + 1);
    }
    c.data = {
        lastAt: evs.at(-1)?.ts ?? null,
        answeredAt: evs.findLast((e) => e.t === "answer")?.ts ?? null,
        prompt: last
            ? { ts: last.ts, text: last.prompt, by: who(last.prompt, mine) }
            : null,
        now: last?.last
            ? {
                  ts: last.last.ts,
                  k: last.last.t === "tool" ? toolKind(last.last.name) : null,
                  text:
                      last.last.t === "tool"
                          ? last.last.text
                          : (last.last.text.split("\n").find((x) => x.trim()) ??
                            ""),
              }
            : null,
        report: report?.answer
            ? { ts: report.answerTs, promptTs: report.ts, text: report.answer }
            : null,
        steps: last?.tools ?? 0,
        trail: last?.trail ?? [],
        segs: segments(evs, mine),
        mins: [...mins],
    };
    return c.data;
}

// ---------- sending ----------

let sent = [];
try {
    sent = JSON.parse(fs.readFileSync(SENT_FILE, "utf8"));
} catch {}
const saveSent = () =>
    fs.writeFileSync(SENT_FILE, JSON.stringify(sent, null, 1));
const busy = new Set(); // panes with a herdr-tell in flight

// Types the message in right away; a busy Claude or Codex queues it itself.
// Not while the pane shows a question or permission prompt: typing there would
// answer it, so those messages wait and are retried.
async function deliver(pane, text) {
    if (await openDialog(pane, true)) return "blocked";
    try {
        await run("herdr", ["agent", "prompt", pane, text]);
        return "delivered";
    } catch (e) {
        const out = `${e.stdout ?? ""}${e.stderr ?? ""}`;
        return out.includes("agent_blocked")
            ? "blocked"
            : `failed: ${out.slice(-200) || e.message}`;
    }
}

async function pump(pane) {
    if (busy.has(pane)) return;
    const msg = sent.find(
        (s) =>
            s.pane === pane &&
            (s.status === "queued" || s.status.startsWith("waiting")),
    );
    if (!msg) return;
    busy.add(pane);
    const r = await deliver(pane, msg.text);
    if (r === "blocked") {
        msg.status =
            "waiting: the thread is stuck on a question in its terminal";
        setTimeout(() => pump(pane), 10_000);
    } else {
        msg.status = r;
        msg.doneAt = new Date().toISOString();
    }
    saveSent();
    busy.delete(pane);
    if (r !== "blocked") pump(pane);
}
sent.filter(
    (s) => s.status !== "delivered" && !s.status.startsWith("failed"),
).forEach((s) => (s.status = "queued"));
[...new Set(sent.map((s) => s.pane))].forEach(pump);

// ---------- http ----------

function curated() {
    try {
        return JSON.parse(
            fs.readFileSync(path.join(DIR, "state.json"), "utf8"),
        );
    } catch {
        return { threads: {} };
    }
}

function ownCard(pane) {
    try {
        return JSON.parse(
            fs.readFileSync(
                path.join(STATUS_DIR, `${pane.replace(/[^\w:-]/g, "_")}.json`),
                "utf8",
            ),
        );
    } catch {
        return null;
    }
}

async function state() {
    const cur = curated();
    const agents = await herdrAgents();
    return {
        at: new Date().toISOString(),
        coordinator: cur.coordinator ?? null,
        agents: await Promise.all(
            agents.map(async (a) => {
                const f = await sessionFile(a.kind, a.session);
                const mine = new Set(
                    sent
                        .filter((s) => s.pane === a.pane)
                        .map((s) => norm(s.text)),
                );
                let l = null;
                try {
                    l = f ? live(a.kind, f, mine) : null;
                } catch {}
                const c = cur.threads?.[a.pane] ?? null;
                const dialog =
                    a.kind === "claude" && a.status !== "working"
                        ? await openDialog(a.pane)
                        : null;
                if (dialog) Object.assign(a, { status: "blocked", dialog });
                const own = ownCard(a.pane);
                const useOwn = own && !(c?.reviewedAt > own.at);
                const card = useOwn
                    ? {
                          name: c?.name,
                          priority: c?.priority,
                          ...own,
                          by: "thread",
                      }
                    : c && { ...c, at: c.reviewedAt, by: "coordinator" };
                // a report is covered by a coordinator summary written after it, or by a
                // card the thread wrote during the same turn (it writes it just before answering)
                const covered =
                    l?.report &&
                    ((c?.reviewedAt && c.reviewedAt >= l.report.ts) ||
                        (own?.at && own.at >= l.report.promptTs));
                return {
                    ...a,
                    card,
                    live: l,
                    newReport: !!(l?.report && card && !covered),
                    sent: sent.filter((s) => s.pane === a.pane).slice(-5),
                };
            }),
        ),
    };
}

async function history(pane) {
    const a = (await herdrAgents()).find((x) => x.pane === pane);
    const f = a && (await sessionFile(a.kind, a.session));
    if (!f) return [];
    return turns(events(a.kind, readLines(f, false)))
        .slice(-30)
        .map(({ ts, prompt, answer, answerTs, tools }) => ({
            ts,
            prompt,
            answer,
            answerTs,
            tools,
        }));
}

const json = (res, code, body) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(body));
};

const server = http.createServer(async (req, res) => {
    // only this page may talk to the server: no DNS rebinding, no cross-site posts
    if (req.headers.host !== `127.0.0.1:${PORT}`)
        return json(res, 403, { error: "host" });
    const url = new URL(req.url, ORIGIN);
    try {
        if (req.method === "GET" && url.pathname === "/") {
            res.writeHead(200, {
                "content-type": "text/html; charset=utf-8",
                "cache-control": "no-store",
            });
            return res.end(
                fs
                    .readFileSync(path.join(DIR, "index.html"), "utf8")
                    .replace("__TOKEN__", TOKEN),
            );
        }
        if (req.method === "GET" && url.pathname === "/api/state")
            return json(res, 200, await state());
        if (req.method === "GET" && url.pathname === "/api/history")
            return json(res, 200, await history(url.searchParams.get("pane")));
        if (req.method === "POST" && url.pathname === "/api/send") {
            if (
                req.headers.origin !== ORIGIN ||
                req.headers["x-token"] !== TOKEN
            )
                return json(res, 403, { error: "origin" });
            let body = "";
            for await (const c of req) body += c;
            const { pane, text } = JSON.parse(body);
            const panes = (await herdrAgents()).map((a) => a.pane);
            if (!panes.includes(pane) || !text?.trim())
                return json(res, 400, { error: "pane or text" });
            const msg = {
                id: crypto.randomUUID(),
                pane,
                text: text.trim(),
                ts: new Date().toISOString(),
                status: "queued",
            };
            sent.push(msg);
            saveSent();
            pump(pane);
            return json(res, 200, msg);
        }
        json(res, 404, { error: "not found" });
    } catch (e) {
        json(res, 500, { error: String(e?.message ?? e) });
    }
});

server.listen(PORT, "127.0.0.1", () => {
    console.log(`agent dashboard at ${ORIGIN}/`);
    if (process.argv.includes("--no-open")) return;
    spawn(
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        [
            `--app=${ORIGIN}/`,
            `--user-data-dir=${path.join(DIR, "chrome-profile")}`,
            "--no-first-run",
            "--window-size=1280,900",
        ],
        { stdio: "ignore", detached: true },
    ).unref();
});
