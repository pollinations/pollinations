#!/usr/bin/env node
// Tiny CLI surface for code-bee. Mirrors catgpt's surfaces/cli/main.ts.
//
// Unlike catgpt's CLI which calls a stateless model, this one needs a real
// per-session working directory — the whole point of the `container` runtime.
// Pass --cwd <abs-path> (defaults to a fresh /tmp/code-bee-<pid>) and the bee
// will read/edit files there.
//
// Usage:
//   node --experimental-strip-types main.ts "rename foo.ts → bar.ts" \
//     --cwd /tmp/my-session
//
// The Claude Agent SDK is dynamically imported so the file can be loaded /
// type-checked without the SDK installed (we keep tests install-free).
// To actually run, install: npm i @anthropic-ai/claude-agent-sdk

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCodeBeeTurn } from "../../src/runner.ts";

function parseArgs(argv: string[]): { prompt: string; cwd?: string } {
    let cwd: string | undefined;
    const rest: string[] = [];
    for (let i = 0; i < argv.length; i++) {
        if (argv[i] === "--cwd" && argv[i + 1]) {
            cwd = argv[++i];
        } else {
            rest.push(argv[i]);
        }
    }
    return { prompt: rest.join(" ").trim(), cwd };
}

const args = parseArgs(process.argv.slice(2));
if (!args.prompt) {
    console.error('usage: code-bee "<prompt>" [--cwd <path>]');
    process.exit(2);
}

const cwd = args.cwd ?? mkdtempSync(join(tmpdir(), "code-bee-"));

// Dynamic import — keeps this module loadable without the SDK installed.
// `query` is a function with shape `(params) => AsyncIterable<unknown>`.
const sdk = (await import("@anthropic-ai/claude-agent-sdk").catch((err) => {
    console.error(
        "@anthropic-ai/claude-agent-sdk not installed. Run: npm i @anthropic-ai/claude-agent-sdk",
    );
    console.error(`(import error: ${(err as Error).message})`);
    process.exit(3);
})) as { query: Parameters<typeof runCodeBeeTurn>[0] };

console.log(`cwd: ${cwd}`);
console.log(`prompt: ${args.prompt}`);
console.log("---");

for await (const ev of runCodeBeeTurn(sdk.query, args.prompt, { cwd })) {
    if (ev.type === "text") process.stdout.write(ev.text);
    else if (ev.type === "tool")
        console.log(`\n[tool: ${ev.name} ${ev.status}]`);
    else if (ev.type === "result") {
        console.log(
            `\n---\nturns: ${ev.turnsUsed}, ok: ${ev.ok}\nworkdir: ${cwd}`,
        );
    }
}
