#!/usr/bin/env node
// agent-pr-clinic: review a pollinations PR with gpt-6.1-sol and (optionally) push a fix branch.
// Usage:
//   POLLINATIONS_API_KEY=... node scripts/review-fix.mjs --pr 17484 [--repo pollinations/pollinations] [--model openai/gpt-6.1-sol] [--out EVIDENCE] [--push --fork mhmdrizzzki/pollinations]
import { readFileSync } from "node:fs";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const agentCfg = JSON.parse(readFileSync(join(root, "agent.json"), "utf8"));

function arg(name, fallback) {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? fallback : fallback;
}
const PR = arg("--pr");
const REPO = arg("--repo", "pollinations/pollinations");
const MODEL = arg("--model", agentCfg.baseModel);
const OUT = arg("--out", join(root, "EVIDENCE"));
const PUSH = process.argv.includes("--push");
const FORK = arg("--fork", "mhmdrizzzki/pollinations");
const KEY = process.env.POLLINATIONS_API_KEY;
const DRY = process.argv.includes("--dry-run");
if (!PR) { console.error("missing --pr"); process.exit(2); }
if (!KEY && !DRY) { console.error("missing POLLINATIONS_API_KEY"); process.exit(2); }

async function gh(path) {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: { "User-Agent": "agent-pr-clinic", Accept: "application/vnd.github.v3+json" },
  });
  if (!r.ok) throw new Error(`gh ${path}: ${r.status} ${await r.text()}`);
  return r.json();
}

const pr = await gh(`/repos/${REPO}/pulls/${PR}`);
const diff = await (await fetch(pr.diff_url, { headers: { "User-Agent": "agent-pr-clinic" } })).text();


// Optional surrounding-file context: for small changed files, fetch the file at head and include it.
async function buildContext(pr) {
  if (!process.argv.includes("--context")) return "";
  const files = (await fetch(`https://api.github.com/repos/${pr.head.repo?.full_name ?? "pollinations/pollinations"}/pulls/${pr.number}/files`, {
    headers: { "User-Agent": "agent-pr-clinic", Accept: "application/vnd.github.v3+json" },
  })).ok ? await (await fetch(`https://api.github.com/repos/${pr.head.repo?.full_name ?? "pollinations/pollinations"}/pulls/${pr.number}/files`, {
    headers: { "User-Agent": "agent-pr-clinic", Accept: "application/vnd.github.v3+json" },
  })).json() : [];
  const out = [];
  for (const f of files) {
    if (f.status === "removed") continue;
    if ((f.additions + f.deletions) > 80) continue; // only small files
    const raw = await fetch(f.raw_url, { headers: { "User-Agent": "agent-pr-clinic" } });
    if (!raw.ok) continue;
    const text = await raw.text();
    if (text.length > 8000) continue;
    out.push(`\n===== FILE CONTEXT: ${f.filename} (head) =====\n${text}`);
  }
  return out.join("\n");
}

const context = await buildContext(pr);
const prompt = `${agentCfg.systemPrompt}

Pull request #${PR}: ${pr.title}
${context}

Surrounding file context (when present) is above. Review the PR diff below.
Author: ${pr.user.login}
Head: ${pr.head.sha} (${pr.head.ref}) Base: ${pr.base.sha}

DIFF:
${diff.slice(0, 30000)}`;

if (DRY) {
  console.log(`[DRY] #${PR} diff ${diff.length} chars, context ${context?.length ?? 0} chars`);
  process.exit(0);
}
const started = Date.now();
const res = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
  method: "POST",
  headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: "user", content: prompt }],
    max_output_tokens: 4096,
  }),
});
if (!res.ok) throw new Error(`model call: ${res.status} ${await res.text()}`);
const data = await res.json();
const answer = data.choices?.[0]?.message?.content ?? "";
const usage = data.usage ?? {};
const ms = Date.now() - started;

const verdict = answer.match(/VERDICT:\s*(FIX|NO-FIX)/i)?.[1] ?? "UNKNOWN";
const patchMatch = answer.match(/PATCH:\s*```diff\n([\s\S]*?)```/i) ?? answer.match(/PATCH:\s*([\s\S]*)/i);

const run = {
  pr: Number(PR), repo: REPO, title: pr.title, author: pr.user.login,
  head_sha: pr.head.sha, head_ref: pr.head.ref, base_sha: pr.base.sha,
  model_requested: MODEL, model_served: data.model ?? MODEL,
  verdict, usage, ms, started_at: new Date(started).toISOString(),
};
mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, `run-${PR}.json`), JSON.stringify(run, null, 2));
writeFileSync(join(OUT, `review-${PR}.md`), `# Review of #${PR} — ${verdict}\n\n${answer}\n`);
console.log(`[${verdict}] #${PR} ${pr.title} — ${usage.prompt_tokens ?? "?"}p/${usage.completion_tokens ?? "?"}c ${ms}ms`);

if (PUSH && verdict === "FIX" && patchMatch) {
  const patch = patchMatch[1].trim();
  writeFileSync(join(OUT, `patch-${PR}.diff`), patch + "\n");
  console.log(`fix candidate saved: EVIDENCE/patch-${PR}.diff`);
  console.log("push step is run by the operator against the fork (see README).");
}
