#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
const src = readFileSync(new URL(import.meta.url), "utf8");
const sys = `Your reply is piped to bash -c by the script below. One command, no prose.\n${src}`;
let log = `Goal: ${process.argv[2] ?? "say hello"}`;
for (let i = 0; i < (process.env.TURNS ?? 5); i++) {
  const r = await fetch("https://gen.pollinations.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${process.env.POLLINATIONS_TOKEN}` },
    body: JSON.stringify({ model: process.env.MODEL ?? "openai-fast",
      messages: [{ role: "system", content: sys }, { role: "user", content: log }] }),
  });
  const cmd = (await r.json()).choices[0].message.content;
  const out = spawnSync("bash", ["-c", cmd], { encoding: "utf8" });
  const buf = (out.stdout ?? "") + (out.stderr ?? "");
  console.log(`\n$ ${cmd}\n${buf}`);
  log += `\n$ ${cmd}\n${buf}`;
}
