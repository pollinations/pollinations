// Live integration test. Hits real gen.pollinations.ai with a token.
//
// Skips automatically when no token is available. Locally, point it at
// enter.pollinations.ai/.testingtokens by running:
//
//   POLLINATIONS_KEY=$(grep '^ENTER_API_TOKEN_REMOTE=' \
//     ../../enter.pollinations.ai/.testingtokens | cut -d= -f2-) \
//     node --experimental-strip-types --test core/live.test.ts
//
// Or set TEXT_POLLINATIONS_TOKEN / POLLINATIONS_KEY in your env.
//
// CI: skipped by default unless POLLINATIONS_LIVE=1 is set in addition to a
// token, so a missing-token CI doesn't fail.

import assert from "node:assert/strict";
import { test } from "node:test";
import {
    buildComicImageUrl,
    generateCatReply,
    generateCatReplyWithUsage,
} from "./index.ts";

const apiKey =
    process.env.POLLINATIONS_KEY ?? process.env.TEXT_POLLINATIONS_TOKEN;
const live =
    process.env.POLLINATIONS_LIVE === "1" ||
    process.env.POLLINATIONS_LIVE === "true";
const skip = !apiKey || !live;
const reason = !apiKey
    ? "no POLLINATIONS_KEY / TEXT_POLLINATIONS_TOKEN"
    : !live
      ? "POLLINATIONS_LIVE not set"
      : "";

test(
    "live: generateCatReply returns a short cat-shaped reply",
    { skip: skip ? `skipped (${reason})` : false, timeout: 30_000 },
    async () => {
        const reply = await generateCatReply("why are boxes magic?", null, {
            apiKey,
        });
        assert.equal(typeof reply, "string");
        assert.ok(reply.length > 0, "reply is non-empty");
        // 2–8 words is the prompt's hard constraint. Allow a touch of slop in case
        // the model outputs punctuation as separate "words" — fail only on obvious
        // policy drift.
        const words = reply.split(/\s+/).filter(Boolean);
        assert.ok(
            words.length <= 12,
            `reply too long: "${reply}" (${words.length} words)`,
        );
        console.log(`  cat said: "${reply}"`);
    },
);

test(
    "live: generateCatReplyWithUsage returns non-zero token counts and cost",
    { skip: skip ? `skipped (${reason})` : false, timeout: 30_000 },
    async () => {
        const { text, usage } = await generateCatReplyWithUsage(
            "what's the meaning of life?",
            null,
            { apiKey },
        );
        assert.ok(text.length > 0, "reply is non-empty");
        assert.ok(usage, "usage block must be present");
        assert.ok(
            usage!.prompt_tokens > 0,
            `prompt_tokens should be > 0, got ${usage!.prompt_tokens}`,
        );
        assert.ok(
            usage!.completion_tokens > 0,
            `completion_tokens should be > 0, got ${usage!.completion_tokens}`,
        );
        assert.ok(
            usage!.cost_pollen > 0,
            `cost_pollen should be > 0, got ${usage!.cost_pollen}`,
        );
        assert.equal(usage!.estimated, false);
        assert.equal(usage!.model, "claude-fast");
        console.log(
            `  cost: ${usage!.prompt_tokens}+${usage!.completion_tokens} tokens = ${usage!.cost_pollen.toFixed(6)} pollen`,
        );
    },
);

test(
    "live: buildComicImageUrl produces a fetchable URL (HEAD ok)",
    { skip: skip ? `skipped (${reason})` : false, timeout: 60_000 },
    async () => {
        const reply = "Naps. Next question.";
        const url = buildComicImageUrl("why are boxes magic?", reply, null, {
            apiKey,
        });
        // Don't actually wait for the image to render (slow + costs Pollen). Just
        // confirm the gen.pollinations.ai/image endpoint accepts the URL shape.
        // GET with a tiny timeout — image gen would time out, but we just need to
        // see that the request reaches the gateway and returns 2xx/3xx, not 4xx.
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 3_000);
        try {
            const res = await fetch(url, {
                signal: ctrl.signal,
                method: "GET",
            });
            assert.ok(res.status < 400, `gateway rejected: ${res.status}`);
        } catch (err) {
            // AbortError is fine — it means the gateway started rendering. Anything
            // else is a real failure.
            const msg = err instanceof Error ? err.message : String(err);
            if (!/abort/i.test(msg)) throw err;
        } finally {
            clearTimeout(t);
        }
    },
);
