import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const src = readFileSync(dir + "agent.ts", "utf8");

test("live catalog, no hardcoded model list", () => {
    assert.match(src, /\/v1\/models\?status=all/);
    assert.match(src, /raw\.name \?\? raw\.id/);
    assert.doesNotMatch(src, /gpt-5\.4-nano|mercury-2\.5|gemini-3\.8|grok-4\.3/);
});

test("capability-fit ladder (vision, long-context, default)", () => {
    assert.match(src, /input_modalities/);
    assert.match(src, /context_length/);
    assert.match(src, /LONG_INPUT_CHARS/);
});

test("health-first ordering with price sort", () => {
    assert.match(src, /healthRank/);
    assert.match(src, /priceOf/);
});

test("cross-model escalation on 429/5xx/timeout", () => {
    assert.match(src, /429/);
    assert.match(src, /MAX_ATTEMPTS/);
    assert.match(src, /escalat/i);
});

test("trace travels in the body, both endpoints", () => {
    assert.match(src, /ladder-router:/);
    assert.match(src, /\/v1\/responses/);
    assert.match(src, /\/v1\/chat\/completions/);
});

test("single self-contained file, platform imports only", () => {
    assert.doesNotMatch(src, /^import .* from "(?!ai|@ai-sdk\/openai-compatible)/m);
    assert.match(src, /export default async function agent/);
});
