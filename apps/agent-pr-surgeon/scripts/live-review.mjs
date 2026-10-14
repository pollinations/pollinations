#!/usr/bin/env node
/**
 * Live runner for the pr-surgeon agent.
 *
 * Runs the shipped handler (`agent.ts`) against a real pull request with real
 * services: the Pollinations model catalog for the review, the caller's own
 * Pollinations key for billing, and — unless `--local-shell` is given — the
 * caller's hosted Pollinations computer for the git work.
 *
 *   node scripts/live-review.mjs <pr-url> [...more urls] \
 *     [--out DIR] [--push-repo owner/fork] [--local-shell DIR] [--model ID]
 *
 * Writes one JSON and one Markdown file per pull request, including the exact
 * cost of the run read back from `GET /account/usage`.
 */
import { execFile } from "node:child_process";
import {
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import agent from "../agent.ts";

const run = promisify(execFile);
const HERE = dirname(fileURLToPath(import.meta.url));
const GEN = "https://gen.pollinations.ai";

function apiKey() {
    if (process.env.POLLINATIONS_API_KEY) return process.env.POLLINATIONS_API_KEY;
    const path = join(homedir(), ".pollinations", "credentials.json");
    return JSON.parse(readFileSync(path, "utf8")).apiKey;
}

function parseArgs(argv) {
    const args = { urls: [], out: join(HERE, "..", "EVIDENCE"), model: undefined };
    for (let index = 0; index < argv.length; index++) {
        const value = argv[index];
        if (value === "--out") args.out = resolve(argv[++index]);
        else if (value === "--push-repo") args.pushRepo = argv[++index];
        else if (value === "--local-shell") args.localShell = resolve(argv[++index]);
        else if (value === "--model") args.model = argv[++index];
        else if (value === "--branch") args.branch = argv[++index];
        else if (value === "--review-only") args.reviewOnly = true;
        else args.urls.push(value);
    }
    return args;
}

const key = apiKey();

async function usage() {
    // Rows are ingested late and the list is newest-first, so ask for a wide
    // window and let usageSince() wait for this run's row to appear.
    const response = await fetch(`${GEN}/account/usage?limit=100`, {
        headers: { authorization: `Bearer ${key}` },
    });
    return (await response.json()).usage ?? [];
}

/**
 * Usage rows are ingested asynchronously, and their `timestamp` is not in UTC,
 * so a run is identified by the rows that were not in the list before it
 * started, not by comparing clocks. The balance is read the same way: whichever
 * of the two shows the charge first ends the wait, and the caller is told both.
 */
async function settle(beforeIds, beforeTier, attempts = 26) {
    let rows = [];
    let after = null;
    for (let attempt = 0; attempt < attempts; attempt++) {
        rows = (await usage()).filter(
            (row) => !beforeIds.has(row.cursor_event_id),
        );
        const read = await balance();
        const tier = tierOf(read);
        if (tier !== null) after = read;
        const delta = tier === null ? 0 : (beforeTier ?? 0) - tier;
        if (rows.some((row) => row.type === "generate.text") || delta > 0) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 5_000));
    }
    return { rows, after: after ?? (await balance()) };
}

function utcNow(offsetSeconds = 0) {
    return new Date(Date.now() + offsetSeconds * 1000)
        .toISOString()
        .replace("T", " ")
        .slice(0, 19);
}

async function balance() {
    const response = await fetch(`${GEN}/account/balance`, {
        headers: { authorization: `Bearer ${key}` },
    });
    return (await response.json()).accountBalance;
}

/** A failed balance read must not look like a balance of zero. */
function tierOf(account) {
    return typeof account?.tier === "number" ? account.tier : null;
}

async function callMcp(server, tool, args) {
    const response = await fetch(`${GEN}/mcp/${server}`, {
        method: "POST",
        headers: {
            authorization: `Bearer ${key}`,
            "content-type": "application/json",
            accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
            jsonrpc: "2.0",
            id: crypto.randomUUID(),
            method: "tools/call",
            params: { name: tool, arguments: args },
        }),
    });
    const text = await response.text();
    const payload = text.includes("\ndata:")
        ? text
              .split("\n")
              .filter((line) => line.startsWith("data:"))
              .map((line) => line.slice(5).trim())
              .join("")
        : text;
    const message = JSON.parse(payload);
    if (message.error) throw new Error(message.error.message);
    if (!response.ok) throw new Error(`MCP HTTP ${response.status}`);
    return message.result;
}

/**
 * The agent addresses the shell as `/workspace`; here that maps onto a local
 * directory. Git must never prompt: an unattended run has no terminal, and a
 * prompt would hang the whole review instead of failing.
 */
let scratch = null;

function shellRunner(root) {
    const base = resolve(root).replaceAll("\\", "/");
    scratch ??= mkdtempSync(join(tmpdir(), "pr-surgeon-stdin-")).replaceAll(
        "\\",
        "/",
    );
    let written = 0;
    return async (command, options = {}) => {
        let translated = command.split("/workspace").join(base);
        // Node's execFile `input` never reaches a login shell on Git Bash for
        // Windows: the child blocks on stdin forever. A scratch file fed to the
        // whole command list as stdin behaves the same and does not hang.
        if (options.stdin !== undefined) {
            const file = join(scratch, `stdin-${written++}`);
            writeFileSync(file, options.stdin);
            translated = `{ ${translated}; } < ${file.replaceAll("\\", "/")}`;
        }
        try {
            const { stdout, stderr } = await run("bash", ["-lc", translated], {
                cwd: options.cwd?.replace("/workspace", base) ?? base,
                maxBuffer: 32 * 1024 * 1024,
                timeout: 240_000,
                env: {
                    ...process.env,
                    GIT_TERMINAL_PROMPT: "0",
                    GIT_ASKPASS: "/bin/true",
                    GCM_INTERACTIVE: "never",
                    GH_PROMPT_DISABLED: "1",
                },
            });
            return { stdout, stderr, exitCode: 0 };
        } catch (error) {
            return {
                stdout: error.stdout ?? "",
                stderr:
                    error.stderr ||
                    (error.killed
                        ? `command timed out after 240s`
                        : String(error.message)),
                exitCode: error.code ?? 1,
            };
        }
    };
}

const args = parseArgs(process.argv.slice(2));
if (!args.urls.length) {
    console.error("usage: node scripts/live-review.mjs <pr-url> [--out DIR]");
    process.exit(2);
}
mkdirSync(args.out, { recursive: true });

for (const url of args.urls) {
    const number = /\/pull\/(\d+)/.exec(url)?.[1] ?? "pr";
    const before = await balance();
    const beforeRows = new Set((await usage()).map((row) => row.cursor_event_id));
    const started = Date.now();
    const startedAt = utcNow(-5);

    const request = new Request("https://gen.pollinations.ai/v1/responses", {
        method: "POST",
        headers: {
            "content-type": "application/json",
            ...(process.env.GITHUB_TOKEN
                ? { "x-github-token": process.env.GITHUB_TOKEN }
                : {}),
        },
        body: JSON.stringify({
            input: url,
            metadata: {
                ...(args.model ? { model: args.model } : {}),
                ...(args.pushRepo ? { push_repo: args.pushRepo } : {}),
                ...(args.branch ? { branch: args.branch } : {}),
                ...(args.reviewOnly ? { review_only: "1" } : {}),
            },
        }),
    });

    const context = {
        request,
        pollinations: (path, init = {}) =>
            fetch(new URL(path, GEN), {
                ...init,
                headers: {
                    ...(init.headers ?? {}),
                    authorization: `Bearer ${key}`,
                },
            }),
        mcp: (server, tool, toolArgs) => callMcp(server, tool, toolArgs),
    };
    if (args.localShell) {
        const local = shellRunner(args.localShell);
        context.mcp = async (server, tool, toolArgs) => {
            if (server !== "computer" || tool !== "bash") {
                throw new Error(`unexpected tool ${server}.${tool}`);
            }
            const result = await local(String(toolArgs.command ?? ""), {
                stdin: toolArgs.stdin,
            });
            return result.exitCode === 0
                ? { content: [{ type: "text", text: result.stdout }] }
                : {
                      content: [
                          { type: "text", text: result.stderr || result.stdout },
                      ],
                      isError: true,
                  };
        };
    }

    const note = (message) =>
        console.error(`[${((Date.now() - started) / 1000).toFixed(0)}s] ${message}`);
    note(`reviewing ${url}`);
    const response = await agent(context);
    const data = await response.json();
    note(`agent answered (${response.status})`);
    const text = data.output?.[0]?.content?.[0]?.text ?? JSON.stringify(data);
    const settled = await settle(beforeRows, before?.tier);
    const rows = settled.rows;
    const after = settled.after;
    const charged = rows.reduce((total, row) => total + (row.cost_usd ?? 0), 0);
    const tier = tierOf(after);
    const delta = tier === null ? 0 : (before?.tier ?? 0) - tier;
    // Rows are the exact per-call cost; the balance covers the case where the
    // rows have not been ingested yet. Neither may be invented: a run whose
    // charge has not been recorded yet is reported as unattributed.
    const cost = charged > 0 ? charged : Math.max(0, delta);
    const elapsed = ((Date.now() - started) / 1000).toFixed(1);

    const record = {
        pr: url,
        at: new Date().toISOString(),
        startedAtUtc: utcNow(-5),
        model: args.model ?? "openai/gpt-6.1-sol",
        shell: args.localShell ? `local:${args.localShell}` : "pollinations computer",
        reviewOnly: Boolean(args.reviewOnly),
        pushRepo: args.pushRepo ?? null,
        seconds: Number(elapsed),
        status: data.status ?? "completed",
        usage: data.usage ?? null,
        pollenCost: Number(cost.toFixed(8)),
        costSource:
            charged > 0
                ? "usage rows"
                : delta > 0
                  ? "balance delta"
                  : "unattributed",
        balance: {
            before: before?.tier ?? null,
            after: after?.tier ?? null,
            delta: Number(delta.toFixed(8)),
        },
        calls: rows.map((row) => ({
            type: row.type,
            model: row.model,
            cost_usd: row.cost_usd,
            input_text_tokens: row.input_text_tokens,
            output_text_tokens: row.output_text_tokens,
            response_time_ms: row.response_time_ms,
        })),
        review: text,
    };
    if (process.env.PR_SURGEON_DEBUG) {
        record.error = data.error ?? null;
        record.raw = data;
    }

    writeFileSync(
        join(args.out, `run-${number}.json`),
        `${JSON.stringify(record, null, 2)}\n`,
    );
    writeFileSync(join(args.out, `evidence-${number}.md`), `${text}\n`);
    console.log(
        `${url} → ${record.status}, ${record.pollenCost} pollen in ${elapsed}s (${rows.length} billed calls)`,
    );
    console.log(text.split("\n").slice(0, 12).join("\n"));
    if (data.error) console.log("ERROR", JSON.stringify(data.error));
}

if (scratch) rmSync(scratch, { recursive: true, force: true });
