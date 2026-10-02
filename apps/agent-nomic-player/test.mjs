import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("./", import.meta.url));
const src = readFileSync(dir + "agent.ts", "utf8");

test("jev decides via /alpha/decisions every run", () => {
    assert.match(src, /\/alpha\/decisions/);
    assert.match(src, /type: "choice"/);
});

test("agent acts on jev, never overrides", () => {
    assert.match(src, /jevVote/);
    assert.match(src, /writeArgument/);
    assert.doesNotMatch(src, /choice\s*=\s*"(yes|no)"/);
});

test("trace carries verdict plus probabilities", () => {
    assert.match(src, /nomic-player: jev voted/);
    assert.match(src, /probabilities/);
});

test("both endpoints answered", () => {
    assert.match(src, /\/v1\/responses/);
    assert.match(src, /choices/);
});

test("single self-contained file", () => {
    assert.match(src, /export default async function agent/);
    assert.doesNotMatch(src, /FAST|BALANCED|DEEP/);
    assert.ok(src.length < 12000);
});
