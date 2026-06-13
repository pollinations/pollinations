#!/usr/bin/env node
// Tiny CLI surface for CatGPT. Proves core/ runs without any HTTP framework.
// Usage:
//   node --experimental-strip-types main.ts "why are boxes magic?"
//   POLLINATIONS_KEY=... node --experimental-strip-types main.ts "..."

import { buildComicImageUrl, generateCatReply } from "../../core/index.ts";

const question = process.argv.slice(2).join(" ").trim();
if (!question) {
    console.error('usage: catgpt "<question>"');
    process.exit(2);
}

const apiKey =
    process.env.POLLINATIONS_KEY ?? process.env.TEXT_POLLINATIONS_TOKEN;
const reply = await generateCatReply(question, null, { apiKey });
const comicUrl = buildComicImageUrl(question, reply, null, { apiKey });

console.log(`Q: ${question}`);
console.log(`A: ${reply}`);
console.log(`comic: ${comicUrl}`);
