import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const agentPath = fileURLToPath(new URL("./agent.json", import.meta.url));
const agent = JSON.parse(readFileSync(agentPath, "utf8"));

test("agent.json matches the prompt-agent schema", () => {
    assert.equal(typeof agent.systemPrompt, "string");
    assert.ok(
        agent.systemPrompt.length > 0 && agent.systemPrompt.length <= 8000,
        "systemPrompt must be 1-8000 characters",
    );
    assert.equal(typeof agent.baseModel, "string");
    assert.ok(agent.baseModel.length > 0);
    assert.ok(Array.isArray(agent.mcpServers));
    assert.ok(agent.mcpServers.includes("computer"));
});

test("uses a dedicated memory folder and leaves other files alone", () => {
    const p = agent.systemPrompt;
    assert.match(p, /\/workspace\/memory-fox-npc\/memories\.md/);
    assert.match(p, /Never.*outside that folder/i);
});

test("covers remember, show, and forget flows", () => {
    const p = agent.systemPrompt.toLowerCase();
    assert.match(p, /remember/);
    assert.match(p, /show memories|what do you remember/);
    assert.match(p, /forget/);
});

test("loads memory first on every turn via bash", () => {
    const p = agent.systemPrompt;
    assert.match(p, /FIRST call bash/);
    assert.match(p, /mkdir -p \/workspace\/memory-fox-npc/);
    assert.match(p, /cat \/workspace\/memory-fox-npc\/memories\.md/);
});

test("keeps it a small prompt agent with no new service", () => {
    const p = agent.systemPrompt;
    assert.doesNotMatch(p, /vector database/i);
    assert.doesNotMatch(p, /new frontend/i);
});
