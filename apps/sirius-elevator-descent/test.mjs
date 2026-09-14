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
});

test("covers only the descent chapter, floors 3 to 1", () => {
    const prompt = agent.systemPrompt;
    assert.match(prompt, /Floor 3/);
    assert.match(prompt, /Floor 2/);
    assert.match(prompt, /Floor 1/);
    assert.doesNotMatch(prompt, /Floor 4/);
    assert.doesNotMatch(prompt, /Floor 5/);
    assert.match(prompt, /no Marvin/);
    assert.match(prompt, /no Guide/);
});

test("keeps the towel exception and the up-preference personality", () => {
    const prompt = agent.systemPrompt;
    assert.match(prompt, /towel/i);
    assert.match(prompt, /UP/);
    assert.match(prompt, /Asimov/);
});

test("requires a floor status line so a stateless prompt agent can track its own position", () => {
    assert.match(agent.systemPrompt, /Floor: <number>/);
});
