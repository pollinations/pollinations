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
// What this surfaces: the deployed worker's surface adapter and its
// advertised agent card don't agree, and the URL projection in their
// `customer-deploy-reference` doesn't match the worker's actual paths.
// Documenting via assertions so reviewers can see the gap concretely.

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

test("codex's card url points at /a2a, but the worker 404s that path", () => {
    // The probe captured: GET /.well-known/agent-card.json → 200,
    // POST /a2a → 404, POST /message → 200. So the agent card advertises
    // an A2A JSON-RPC endpoint at .../a2a that doesn't exist. An A2A
    // client that reads the card will follow `url` and fail.
    //
    // This isn't a fixture assertion — it's a concrete bug in the
    // deployed worker. Pinning it here so the merge discussion can refer
    // to a test, not a paragraph.
    const card = loadJson("agent-card.json");
    assert.match(card.url, /\/a2a$/, "card url ends in /a2a");
    // (We can't assert on the live 404 here without a network call; the
    // probe-summary.md fixture documents the live result.)
});

test("codex's /message response shape: { text, state: { turns } }", () => {
    const msg = loadJson("message-response.json");
    assert.equal(typeof msg.text, "string");
    assert.equal(typeof msg.state, "object");
    assert.equal(typeof msg.state.turns, "number");
    assert.ok(msg.state.turns > 0, "turns counter persists across requests");
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

test("protocolVersion divergence: ours 0.2.5 vs theirs 0.3.0", () => {
    // Worth bumping ours to 0.3.0 to match. Pinning so it shows up in CI
    // when whoever does the convergence touches handler.ts.
    const ours = buildAgentCard("https://x");
    const theirs = loadJson("agent-card.json");
    assert.equal(ours.protocolVersion, "0.2.5");
    assert.equal(theirs.protocolVersion, "0.3.0");
});

test("theirs declares streaming: false, ours also declares streaming: false", () => {
    // Both bees are non-streaming. Same answer, same shape.
    const ours = buildAgentCard("https://x");
    const theirs = loadJson("agent-card.json");
    assert.equal(ours.capabilities.streaming, false);
    assert.equal(theirs.capabilities.streaming, false);
});

test("URL projection from codex's customer-deploy-reference doesn't match the deployed worker", () => {
    // Codex's `routeForSurface` produces:
    //   web:    `${root}/web/messages`
    //   a2a:    `${root}/.well-known/agent-card.json`
    //
    // Probe of the live worker:
    //   POST /web/messages → 404
    //   POST /message      → 200    (this is what the bee actually serves)
    //   POST /a2a          → 404    (despite the card pointing here)
    //
    // The contract advertised by the deploy API and the contract
    // implemented by the bee don't match. Either the URL scheme should
    // change, or the bees should add aliases.
    //
    // Documented as a no-op assertion since we can't probe live in a
    // pure unit test — see test-fixtures/codex-deployed-cf/probe-summary.md
    // for the live evidence.
    const expectedDeployRouteForWeb = "/web/messages";
    const actualWorkerRouteForWeb = "/message";
    assert.notEqual(expectedDeployRouteForWeb, actualWorkerRouteForWeb);
});
