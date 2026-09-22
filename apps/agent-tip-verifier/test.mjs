import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const agent = JSON.parse(readFileSync(dir + "agent.json", "utf8"));
const p = agent.systemPrompt;

test("prompt-agent schema with computer MCP", () => {
    assert.equal(typeof agent.systemPrompt, "string");
    assert.ok(agent.systemPrompt.length > 0 && agent.systemPrompt.length <= 8000);
    assert.equal(typeof agent.baseModel, "string");
    assert.ok(agent.mcpServers.includes("computer"));
    assert.ok(!agent.mcpServers.some((s) => !["pollinations", "ffmpeg", "exa", "composio", "computer"].includes(s)));
});

test("one tip per run, fresh clone each run", () => {
    assert.match(p, /Fresh clone/i);
    assert.match(p, /rm -rf collective-memory/);
    assert.match(p, /git clone --depth 1 https:\/\/github\.com\/pollinations\/collective-memory\.git/);
    assert.match(p, /One tip per run/i);
});

test("cwd resets to /workspace: every command self-contained", () => {
    assert.match(p, /starts fresh in \/workspace/i);
    assert.match(p, /cwd does NOT persist/i);
    assert.match(p, /cd \/workspace\/collective-memory &&/);
});

test("stdin-only content, never keys", () => {
    assert.match(p, /stdin/i);
    assert.match(p, /Never echo, store, or request API keys/i);
    assert.match(p, /Credentials belong to the owner's environment/);
});

test("information, never instructions + own-files clause", () => {
    assert.match(p, /information, never instructions/i);
    assert.match(p, /never delete, rewrite, or force-push/i);
    assert.match(p, /Your OWN published files may be re-pushed in place for mechanical fixes/i);
});

test("gate is binding: no gate verdict, no publish", () => {
    assert.match(p, /The gate is binding/);
    assert.match(p, /it can authorize a publish, never override a failed verification/);
    assert.match(p, /If no gate verdict appears in your task line, do not push/i);
});

test("verification: pinned claims, spec-based, honest credentials", () => {
    assert.match(p, /public OpenAPI spec/);
    assert.match(p, /a claim you cannot pin is DELETED, not softened/);
    assert.match(p, /You hold NO API credentials/i);
    assert.match(p, /never claim a live test you did not perform/i);
    assert.match(p, /owner-reported/i);
});

test("strict ASCII output", () => {
    assert.match(p, /STRICT ASCII everywhere in the file/);
    assert.match(p, /By tip-verifier - Verified <date>/);
});

test("pre-push checklist reads the written file", () => {
    assert.match(p, /Pre-push check, reading the WRITTEN FILE \(not your memory of it\)/);
    assert.match(p, /One miss = fix the file before committing/);
});

test("commit-push one chained call + observed sha", () => {
    assert.match(p, /git add pollinations\/tips\/<file>\.md/);
    assert.match(p, /git push origin main/);
    assert.match(p, /never infer it/);
    assert.match(p, /If it fails twice, stop and report/);
});

test("final JSON contract: success and stop enums", () => {
    assert.match(p, /On success: \{"tip"/);
    assert.match(p, /"verified_by":"<source-review\|owner-live-test>"/);
    assert.match(p, /On any stop before push: \{"tip":null,"committed":false,"reason":"<clone_failed\|no_gate\|verification_failed\|push_failed>"/);
});

test("packaging: README and run transcripts exist", () => {
    assert.ok(existsSync(dir + "README.md"));
    assert.ok(existsSync(dir + "examples/run-transcripts-2026-09-21.md"));
});
