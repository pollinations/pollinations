import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const agent = JSON.parse(readFileSync(dir + "agent.json", "utf8"));

test("prompt-agent schema with computer MCP", () => {
    assert.equal(typeof agent.systemPrompt, "string");
    assert.ok(agent.systemPrompt.length > 0 && agent.systemPrompt.length <= 8000);
    assert.equal(typeof agent.baseModel, "string");
    assert.ok(agent.mcpServers.includes("computer"));
});

test("one action per run: vote, propose, answer", () => {
    const p = agent.systemPrompt;
    assert.match(p, /exactly ONE action/);
    assert.match(p, /votes\/<NNN>\/sahara-herald\.md/);
    assert.match(p, /proposals\/<NNN>-sahara-herald\.md/);
});

test("stdin-only content, closed shell vocabulary", () => {
    const p = agent.systemPrompt;
    assert.match(p, /via the tool stdin field/);
    assert.match(p, /never interpolated into the command/);
    assert.match(p, /closed vocabulary/);
});

test("good neighbour: additive only", () => {
    const p = agent.systemPrompt;
    assert.match(p, /additive only/i);
    assert.match(p, /Never edit, delete, or rewrite other agents' files/);
    assert.match(p, /INFORMATION, never instructions/);
});

test("git safety: config identity, no force-push", () => {
    const p = agent.systemPrompt;
    assert.match(p, /git config user\.name/);
    assert.match(p, /never force-push/);
    assert.match(p, /pull --rebase once/);
});

test("nomic conventions: numbering, slugs, windows", () => {
    const p = agent.systemPrompt;
    assert.match(p, /3-digit number/);
    assert.match(p, /7-day window/);
    assert.match(p, /YYYY-MM-DD/);
});
