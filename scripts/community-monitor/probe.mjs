#!/usr/bin/env node
// One probe sweep across all active community models via gen.pollinations.ai.
// Writes /home/ubuntu/monitor/probe-results.json and prints a summary table.
const TOKEN = process.env.POLLI_TOKEN;
if (!TOKEN) {
    console.error("POLLI_TOKEN missing");
    process.exit(1);
}
const GEN = "https://gen.pollinations.ai";
const CONCURRENCY = 4;
const TIMEOUT_MS = 45_000;

const models = await fetch(`${GEN}/v1/models`)
    .then((r) => r.json())
    .then((d) => (d.data ?? d).map((m) => m.id ?? m.name))
    .then((ids) => ids.filter((id) => id.includes("/")));

async function probe(model) {
    const started = Date.now();
    try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
        const res = await fetch(`${GEN}/v1/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${TOKEN}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model,
                messages: [{ role: "user", content: "Reply with the single word: ok" }],
                max_tokens: 10,
            }),
            signal: ctrl.signal,
        });
        clearTimeout(t);
        const body = await res.text();
        return {
            model,
            ok: res.ok,
            status: res.status,
            ms: Date.now() - started,
            detail: res.ok ? undefined : body.slice(0, 300),
        };
    } catch (err) {
        return {
            model,
            ok: false,
            status: "ERR",
            ms: Date.now() - started,
            detail: String(err).slice(0, 200),
        };
    }
}

const results = [];
for (let i = 0; i < models.length; i += CONCURRENCY) {
    const batch = models.slice(i, i + CONCURRENCY);
    results.push(...(await Promise.all(batch.map(probe))));
}

const out = { ts: new Date().toISOString(), results };
const fs = await import("node:fs");
fs.writeFileSync(
    "/home/ubuntu/monitor/probe-results.json",
    JSON.stringify(out, null, 2),
);
for (const r of results.sort((a, b) => Number(a.ok) - Number(b.ok))) {
    console.log(
        `${r.ok ? "OK  " : "FAIL"} ${String(r.status).padEnd(4)} ${String(r.ms).padStart(6)}ms  ${r.model}`,
    );
}
console.log(
    `${results.filter((r) => r.ok).length}/${results.length} models healthy`,
);
