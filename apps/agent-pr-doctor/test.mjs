// Live check for pr-doctor.
//
// Requires the agent to be registered first:
//   npx @pollinations/cli agents create --config apps/agent-pr-doctor/agent.json \
//     --name pr-doctor --title "PR Doctor"
//
// Run with:
//   POLLINATIONS_API_KEY=sk_... node apps/agent-pr-doctor/test.mjs
//
// Asserts the two things that matter:
//   1. it actually reads the PR and returns a verdict
//   2. it does not claim to have pushed to the caller's repository
import assert from "node:assert";

const KEY = process.env.POLLINATIONS_API_KEY;
if (!KEY) {
  console.error("POLLINATIONS_API_KEY is required");
  process.exit(1);
}

// A real, already-merged PR with a known shape: three added files.
const PR_URL = process.env.PR_DOCTOR_PR_URL ?? "https://github.com/pollinations/pollinations/pull/17251";
const MODEL = process.env.PR_DOCTOR_MODEL ?? "kreggscode/pr-doctor";
const API = "https://gen.pollinations.ai/v1/chat/completions";

const res = await fetch(API, {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: "Bearer " + KEY },
  body: JSON.stringify({
    model: MODEL,
    max_tokens: 1200,
    messages: [{ role: "user", content: "Review this pull request: " + PR_URL }],
  }),
});

const data = await res.json().catch(() => null);
assert.ok(res.ok, "HTTP " + res.status + ": " + JSON.stringify(data).slice(0, 300));

const reply = data.choices?.[0]?.message?.content ?? "";
assert.ok(reply.length > 0, "empty reply");

const results = [];
const lower = reply.toLowerCase();

// 1. It must have produced a verdict about the change.
assert.match(reply, /verdict|correct|review/i, "no verdict section in reply");
results.push("verdict present (" + reply.length + " chars)");

// 2. It must not claim to have pushed to the caller's repository. The sandbox
//    cannot: an arbitrary-repo push returns HTTP 401.
const claimsForkPush = /pushed (the )?(fix|patch|commit) to (your|the) (fork|branch|repo)/i.test(reply);
assert.ok(!claimsForkPush, "claims to have pushed to the caller's repository");
results.push("no false push claim");

// 3. It must name a real handoff location.
const mentionsCollectiveMemory = reply.includes("collective-memory") || lower.includes("pr-fixes");
assert.ok(mentionsCollectiveMemory, "does not name the collective-memory handoff path");
results.push("collective-memory handoff named");

// 4. It must have read the diff, not guessed.
assert.match(reply, /agent-pr-fixer|agent\.json|test\.mjs|README/, "does not mention any file from the PR it was given");
results.push("read the actual diff");

console.log("PASS\n" + results.map((r) => "  " + r).join("\n"));
console.log("\n--- reply ---\n" + reply);
