// agent-pr-clinic smoke test: exercises the full fetch + prompt-build path
// without spending tokens (--dry-run), then checks the agent config.
import { execFileSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const script = join(root, "scripts/review-fix.mjs");

const cfg = JSON.parse(readFileSync(join(root, "agent.json"), "utf8"));
if (!cfg.baseModel || !cfg.systemPrompt.includes("VERDICT")) {
    throw new Error("agent.json must define baseModel and the VERDICT contract");
}
console.log("agent.json OK:", cfg.baseModel);

const out = execFileSync("node", [script, "--pr", "17447", "--repo", "pollinations/pollinations", "--dry-run"], {
    encoding: "utf8",
});
if (!out.includes("[DRY]") || !out.includes("#17447")) {
    throw new Error(`dry-run failed: ${out}`);
}
console.log("dry-run OK:", out.trim());
