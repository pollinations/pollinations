#!/usr/bin/env node
/**
 * Regenerates the playground's seeded example after DEMO changes.
 *
 *   POLLINATIONS_TOKEN=sk_... node scripts/warm-demo.mjs
 *
 * The example image on /play is a live gen.pollinations.ai URL served from
 * the media cache, which is public once the URL has been generated once. Any
 * edit to DEMO in src/ui/play/Playground.tsx makes a new URL that has never
 * been generated — a cache MISS, which 401s anonymously, and the example
 * simply stops loading for visitors.
 *
 * To make drift impossible, this script does not carry its own copy of the
 * values: it reads DEMO out of Playground.tsx and builds the same URL the
 * page will request.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(
    join(HERE, "..", "src", "ui", "play", "Playground.tsx"),
    "utf8",
);

const block = source.match(/const DEMO = \{([\s\S]*?)\n\};/)?.[1];
if (!block) {
    console.error("could not find `const DEMO = {...}` in Playground.tsx");
    process.exit(1);
}
const field = (name) =>
    block.match(new RegExp(`${name}: "?([^",\\n]+)"?,`))?.[1];
const demo = {
    prompt: field("prompt"),
    model: field("model"),
    width: field("width"),
    height: field("height"),
    seed: field("seed"),
};
for (const [key, value] of Object.entries(demo)) {
    if (!value) {
        console.error(`could not parse DEMO.${key}`);
        process.exit(1);
    }
}

const token = process.env.POLLINATIONS_TOKEN;
if (!token) {
    console.error("POLLINATIONS_TOKEN is required (an sk_ key)");
    process.exit(1);
}

const url =
    `https://gen.pollinations.ai/image/${encodeURIComponent(demo.prompt)}` +
    `?model=${demo.model}&width=${demo.width}&height=${demo.height}` +
    `&nologo=true&seed=${demo.seed}`;

console.log(
    `warming: ${demo.model} seed ${demo.seed} — "${demo.prompt.slice(0, 60)}…"`,
);
const generate = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
});
console.log(`generate: ${generate.status} ${generate.headers.get("x-cache")}`);
if (!generate.ok) process.exit(1);

// The proof that matters: the same URL with no credentials.
const anonymous = await fetch(url);
console.log(
    `anonymous: ${anonymous.status} ${anonymous.headers.get("x-cache")} — ` +
        (anonymous.ok ? "visitors will see it" : "STILL NOT PUBLIC"),
);
process.exit(anonymous.ok ? 0 : 1);
