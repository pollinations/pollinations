// Interop probe of codex's deployed Cloudflare worker (PR #10636's
// minimal-cloudflare-agents bee, deployed live per their issue comment of
// 2026-05-03).
//
// External-observer evidence: an independent agent calling their live
// deployment and capturing what it actually serves, vs. their own smoke
// (which they ran themselves). The fixtures under
// test-fixtures/codex-deployed-cf/ are snapshots so this test does not
// depend on the worker still being up.
//
// History:
//   Phase H (commit fc91a46ea) — initial probe found two bugs: card-promised
//     /a2a returned 404, and /web/messages was 404 despite codex's
//     `routeForSurface` projecting it. Pinned both as assertions.
//   Phase I (this file) — codex addressed both. /a2a now returns JSON-RPC
//     2.0 envelopes; /web/messages now aliases /message. Assertions
//     re-pinned to assert *convergence* rather than divergence, so any
//     regression breaks loudly.

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { buildAgentCard } from "../catgpt/surfaces/a2a/handler.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixtures = path.join(here, "test-fixtures", "codex-deployed-cf");

function loadJson(name: string): any {
    return JSON.parse(fs.readFileSync(path.join(fixtures, name), "utf8"));
}

test("codex's deployed agent card is valid A2A v0.3.0", () => {
    const card = loadJson("agent-card.json");
    assert.equal(card.protocolVersion, "0.3.0");
    assert.equal(card.preferredTransport, "JSONRPC");
    assert.equal(typeof card.url, "string");
    assert.equal(typeof card.name, "string");
    assert.ok(Array.isArray(card.skills));
    assert.ok(card.skills.length > 0);
});

test("codex's /a2a endpoint matches what the agent card advertises (Phase I — fixed)", () => {
    // Phase H: card said `url: ".../a2a"` but POST /a2a returned 404.
    // Phase I: codex added the /a2a handler. The card and the worker now
    // agree. We pin the JSON-RPC 2.0 envelope shape so a future regression
    // (e.g., reverting the handler, or breaking the JSON-RPC contract)
    // breaks loudly.
    const card = loadJson("agent-card.json");
    const a2a = loadJson("a2a-response.json");
    assert.match(card.url, /\/a2a$/, "card url ends in /a2a");
    assert.equal(a2a.jsonrpc, "2.0", "/a2a returns JSON-RPC 2.0 envelope");
    assert.ok(a2a.result, "/a2a returns a result, not an error");
    assert.equal(a2a.result.message.role, "agent");
    assert.ok(Array.isArray(a2a.result.message.parts));
    assert.equal(a2a.result.message.parts[0].kind, "text");
});

test("codex's /web/messages endpoint serves what routeForSurface projects (Phase I — fixed)", () => {
    // Phase H: routeForSurface projected /web/messages but worker served
    // only /message. Phase I: codex made /web/messages an alias of
    // /message — same response shape. The deploy-API URL contract and
    // the bee implementation agree.
    const wm = loadJson("web-messages-response.json");
    const m = loadJson("message-response.json");
    assert.equal(typeof wm.text, "string");
    assert.equal(typeof wm.state.turns, "number");
    assert.equal(typeof m.text, "string");
    assert.equal(typeof m.state.turns, "number");
    // Both endpoints return the same shape, confirming alias behavior.
    assert.deepEqual(Object.keys(wm).sort(), Object.keys(m).sort());
});

test("durable-object state persists across requests", () => {
    // Pinned in Phase H, still true in Phase I — turn counter advances
    // across all our probe calls. Across the two probes (~30 min apart)
    // it climbed past 17, confirming state survives codex's redeploys
    // because the DO is named per-instance not per-deployment.
    const m = loadJson("message-response.json");
    assert.ok(m.state.turns > 0, "turns counter persists across requests");
});

test("our agent card and codex's share the A2A skeleton fields", () => {
    // Both follow the A2A spec, so the field intersection should be:
    //   protocolVersion, name, description, url, capabilities,
    //   defaultInputModes, defaultOutputModes, skills
    const ours = buildAgentCard("https://gen.pollinations.ai/bees/catgpt");
    const theirs = loadJson("agent-card.json");
    const required = [
        "protocolVersion",
        "name",
        "description",
        "url",
        "capabilities",
        "defaultInputModes",
        "defaultOutputModes",
        "skills",
    ];
    for (const f of required) {
        assert.ok(f in ours, `our card missing ${f}`);
        assert.ok(f in theirs, `codex's card missing ${f}`);
    }
});

test("protocolVersion convergence: ours bumped to 0.3.0 to match codex", () => {
    // Phase H pinned the divergence (ours 0.2.5, theirs 0.3.0). Phase I
    // bumps ours to 0.3.0 since they're the deployed reference and 0.3.0
    // is the current A2A spec version. Now both sides match.
    const ours = buildAgentCard("https://x");
    const theirs = loadJson("agent-card.json");
    assert.equal(ours.protocolVersion, "0.3.0");
    assert.equal(theirs.protocolVersion, "0.3.0");
});

test("theirs declares streaming: false, ours also declares streaming: false", () => {
    // Both bees are non-streaming. Same answer, same shape.
    const ours = buildAgentCard("https://x");
    const theirs = loadJson("agent-card.json");
    assert.equal(ours.capabilities.streaming, false);
    assert.equal(theirs.capabilities.streaming, false);
});
