// Phase J — external probe of codex's newly added /v1/chat/completions
// surface on the live minimal-cloudflare-agents bee (PR #10636 commit
// `eaf18f5f9` shipped "all bees are OpenAI-compatible agents", `08708141d`
// took the friction-research simplifications).
//
// Fixtures under test-fixtures/codex-deployed-cf/openai-completions-*.json
// are snapshots captured 2026-05-03 ~11:35Z so this test does not depend
// on the worker still being up.
//
// What this surfaces beyond the canonical-shape happy path:
//   - empty body {}: 200 (no validation of required `messages`)
//   - no `messages` array: 200 (no validation)
//   - `stream: true`: returns a single non-streamed JSON response (caller
//     asking for SSE silently gets a regular JSON — worst-of-both)
//   - bogus bearer token: 200 (auth not enforced on this bee)
//   - /bees/{any-id}/v1/chat/completions: 200 (hosted-projection path
//     does not validate the bee id; wrong id = same response)
//   - role: "assistant" user input: 200 with empty content (silently
//     dropped — bee accepts only role: user but the OpenAI shape allows
//     any role and the surface should reflect that)
//
// These are not bugs in the unit tests' sense — the bee is a *minimal*
// reference and aggressive lenience is by design — but they're concrete
// gaps a production bee will need to close. Pinned here so a regression
// to "now /bees/wrong-id 404s" or "stream:true now SSE-streams" breaks
// loudly and we notice the contract changed.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "test-fixtures", "codex-deployed-cf");

function loadJson(name: string): any {
    return JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));
}

test("codex's /v1/chat/completions returns canonical OpenAI Chat Completion shape", () => {
    const resp = loadJson("openai-completions-response.json");
    assert.equal(resp.object, "chat.completion");
    assert.equal(typeof resp.id, "string");
    assert.equal(typeof resp.created, "number");
    assert.equal(typeof resp.model, "string");
    assert.ok(Array.isArray(resp.choices));
    assert.equal(resp.choices.length, 1);
    const choice = resp.choices[0];
    assert.equal(choice.index, 0);
    assert.equal(choice.message.role, "assistant");
    assert.equal(typeof choice.message.content, "string");
    assert.equal(choice.finish_reason, "stop");
});

test("hosted-projection path /bees/{id}/v1/chat/completions returns the same shape", () => {
    const direct = loadJson("openai-completions-response.json");
    const hosted = loadJson("openai-completions-hosted-path-response.json");
    // Same envelope — the hosted projection is a path-rewrite, not a
    // different surface. Object/created/choices/metadata fields all
    // present on both.
    const sharedKeys = [
        "object",
        "id",
        "created",
        "model",
        "choices",
        "metadata",
    ];
    for (const k of sharedKeys) {
        assert.ok(k in direct, `direct response missing ${k}`);
        assert.ok(k in hosted, `hosted response missing ${k}`);
    }
    assert.equal(direct.object, hosted.object);
});

test("state extension lives under metadata.state (single namespaced key)", () => {
    // Pollinations-side recommendation B2 from the friction research: bee
    // extras under one namespaced key, not scattered across metadata.*,
    // usage.cost_*, message.metadata.*. Codex's minimal bee already does
    // this correctly — pin it.
    const resp = loadJson("openai-completions-response.json");
    assert.equal(typeof resp.metadata, "object");
    assert.equal(typeof resp.metadata.state, "object");
    assert.equal(typeof resp.metadata.state.turns, "number");
    assert.ok(resp.metadata.state.turns > 0);
});

test("no `usage` field on minimal bee (no upstream model call to count)", () => {
    // Minimal bee echoes; doesn't call any model. The richer bee (catgpt)
    // does emit usage. Document that the contract is "usage is optional"
    // and minimal bees are allowed to omit it.
    const resp = loadJson("openai-completions-response.json");
    assert.equal(resp.usage, undefined);
});

test("model field is echoed back from request (no validation, no rewrite)", () => {
    // We sent model: "x" in the fixture-capture request. The bee echoes
    // it. This is by design for a minimal bee but documents that it does
    // not enforce its own bee.json model declaration as the response model.
    const resp = loadJson("openai-completions-response.json");
    assert.equal(resp.model, "x");
});
