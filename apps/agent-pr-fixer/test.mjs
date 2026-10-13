import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const agent = JSON.parse(
    readFileSync(new URL("./agent.json", import.meta.url), "utf8"),
);
const mcpIds = [
    ...readFileSync(
        new URL("../../shared/registry/mcp.ts", import.meta.url),
        "utf8",
    ).matchAll(/^\s{8}id: "([a-z]+)",$/gm),
].map((m) => m[1]);
const textRegistry = readFileSync(
    new URL("../../shared/registry/text.ts", import.meta.url),
    "utf8",
);

test("agent.json matches the prompt agent contract", () => {
    assert.ok(agent.systemPrompt.length >= 1);
    assert.ok(agent.systemPrompt.length <= 8000);
    assert.ok(textRegistry.includes(`"${agent.baseModel}"`));
    for (const server of agent.mcpServers) assert.ok(mcpIds.includes(server));
});

test("prompt keeps the push and token guardrails", () => {
    assert.match(agent.systemPrompt, /Never push to the PR's own repository/);
    assert.match(agent.systemPrompt, /never force/i);
    assert.match(agent.systemPrompt, /Never print, store or write the token/);
    assert.match(agent.systemPrompt, /unified diff/);
});
