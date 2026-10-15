import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const agent = JSON.parse(readFileSync(dir + "agent.json", "utf8"));

test("prompt-agent schema with computer MCP", () => {
    assert.equal(typeof agent.systemPrompt, "string");
    assert.ok(agent.systemPrompt.length > 0 && agent.systemPrompt.length <= 8000);
    assert.equal(agent.baseModel, "openai/gpt-6.1-sol");
    assert.ok(Array.isArray(agent.mcpServers));
    assert.ok(agent.mcpServers.includes("computer"));
});

test("reads via .diff, never the rate-limited API", () => {
    assert.match(agent.systemPrompt, /\.diff/);
    assert.match(agent.systemPrompt, /rate-limited/);
});

test("push and token guardrails", () => {
    const p = agent.systemPrompt;
    assert.match(p, /Never push to the PR's own repository/);
    assert.match(p, /never force/i);
    assert.match(p, /Never print, store, or write the token/);
    assert.match(p, /unified diff/);
});

test("one fix, honest nothing-wrong path", () => {
    const p = agent.systemPrompt;
    assert.match(p, /If nothing is wrong, say so and push nothing/);
    assert.match(p, /Never invent a fix/);
    assert.match(p, /at most ten bash calls/);
});
