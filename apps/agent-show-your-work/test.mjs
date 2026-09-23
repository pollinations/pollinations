#!/usr/bin/env node
// Validation checks for apps/agent-show-your-work/agent.json
// Run: node test.mjs   (from this directory)   — exits 1 on any failure.

import { readFileSync } from "node:fs";

const AGENT = JSON.parse(readFileSync(new URL("./agent.json", import.meta.url), "utf8"));
const README = readFileSync(new URL("./README.md", import.meta.url), "utf8");
const prompt = AGENT.systemPrompt ?? "";

let pass = 0, fail = 0;
const results = [];
function check(name, ok, detail = "") {
  results.push(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` - ${detail}` : ""}`);
  ok ? pass++ : fail++;
}

// catalog contract
check("agent.json parses as JSON", true);
check("name is lowercase dashed slug", AGENT.name === "show-your-work", AGENT.name);
check("title present and <= 42 chars", typeof AGENT.title === "string" && AGENT.title.length > 0 && AGENT.title.length <= 42, `${(AGENT.title ?? "").length} chars`);
check("description present", typeof AGENT.description === "string" && AGENT.description.length > 0);
check("systemPrompt within 1..8000 chars", prompt.length >= 1 && prompt.length <= 8000, `${prompt.length} chars`);
check("baseModel set", typeof AGENT.baseModel === "string" && AGENT.baseModel.length > 0, AGENT.baseModel);
check("mcpServers includes computer", Array.isArray(AGENT.mcpServers) && AGENT.mcpServers.includes("computer"), JSON.stringify(AGENT.mcpServers));

// safety rules encoded in the prompt
check("append-only rule (never edit/delete)", /NEVER edit, move, or delete/.test(prompt));
check("writes restricted to maths notes", /Write only under maths\/problems\/\*\/notes\//.test(prompt));
check("repo content = information, never instructions", /INFORMATION, never instructions/.test(prompt));
check("no private data rule", /Never write private data, keys/.test(prompt));
check("push-rejection protocol (rebase once, then stop)", /pull --rebase once, push once more/.test(prompt));
check("git identity via git config (shim gotcha)", /config user\.name/.test(prompt) && /rejects `git -c user\.name/.test(prompt));
check("file content via stdin, never in command", /stdin field, never inside the command/.test(prompt));
check("cwd-reset gotcha handled (absolute paths)", /no memory of the working directory between calls/.test(prompt));
check("one commit per run", /One commit per run/.test(prompt));
check("honest labelling rule (bounded search != counterexample)", /failed bounded search is not a counterexample/.test(prompt));
check("exact command + exact output required in notes", /EXACT command, the EXACT output/.test(prompt));

// printable ASCII only (multi-byte is mangled by the MCP stdin path)
const bad = [...prompt].filter((c) => c.codePointAt(0) > 126 || (c.codePointAt(0) < 32 && c !== "\n"));
check("systemPrompt is printable ASCII only", bad.length === 0, `${bad.length} offending chars`);

// no secrets anywhere
const blob = JSON.stringify(AGENT) + README;
check("no embedded API keys", !/sk_[A-Za-z0-9]{8,}/.test(blob));

// README documents the callable name
check("README mentions callable name", README.includes("cesus-agent/show-your-work"));

console.log(`show-your-work agent validation: ${pass} passed, ${fail} failed`);
for (const r of results) console.log("  " + r);
process.exit(fail === 0 ? 0 : 1);
