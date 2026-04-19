#!/usr/bin/env node
// Pure pipe agent: llm -> bash -> llm -> bash ...
//   ./agent.js "goal sentence"
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const system = readFileSync(new URL("PROMPT.md", import.meta.url), "utf8");

const turns = Number(process.env.TURNS ?? 5);
let history = `# GOAL: ${process.argv[2] ?? "say hello"}`;
const model = process.env.MODEL ?? "glm";

for (let i = 1; i <= turns; i++) {
  const cmd = spawnSync("polli", ["gen", "text", "--model", model, "--no-stream", "--system", system],
    { input: history, encoding: "utf8", stdio: ["pipe", "pipe", "ignore"], timeout: 120_000 }).stdout?.trim() ?? "";
  if (!cmd) { console.log("[empty reply from model — stopping]"); break; }

  console.log(`\n--- turn ${i} ---\n$ ${cmd}`);
  const r = spawnSync("bash", ["-c", cmd], { encoding: "utf8" });
  const buf = (r.stdout ?? "") + (r.stderr ?? "");
  process.stdout.write(buf.endsWith("\n") ? buf : buf + "\n");
  history += `\n$ ${cmd}\n${buf}`;
}
