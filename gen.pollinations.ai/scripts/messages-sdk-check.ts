// Live end-to-end check for /v1/messages, run by hand against the deployed
// gateway (it needs a real key and spends a little pollen). Mirrors the quest
// acceptance: plain, streamed, tool-use and image requests through the
// official Anthropic TypeScript SDK, using base_url + auth_token.
//
//   ANTHROPIC_BASE_URL=https://gen.pollinations.ai \
//   POLL_KEY=sk_... \
//   MODEL=openai \
//   npx tsx gen.pollinations.ai/scripts/messages-sdk-check.ts
//
// It is not part of the vitest suite because it calls a live endpoint.

import Anthropic from "@anthropic-ai/sdk";

const apiKey = process.env.POLL_KEY;
const model = process.env.MODEL ?? "openai";
if (!apiKey) throw new Error("Set POLL_KEY to a Pollinations secret key.");

const client = new Anthropic({
    baseURL: process.env.ANTHROPIC_BASE_URL ?? "https://gen.pollinations.ai",
    apiKey,
});

const line = (label: string, value: unknown) =>
    console.log(`\n== ${label} ==\n${JSON.stringify(value, null, 2)}`);

// 1. plain
const plain = await client.messages.create({
    model,
    max_tokens: 64,
    messages: [{ role: "user", content: "Reply with exactly one word: pong" }],
});
line("plain", { content: plain.content, stop_reason: plain.stop_reason, usage: plain.usage });

// 2. streamed
process.stdout.write("\n== streamed ==\n");
const stream = client.messages.stream({
    model,
    max_tokens: 64,
    messages: [{ role: "user", content: "Count 1 to 3." }],
});
let text = "";
for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
        text += event.delta.text;
    }
}
console.log("streamed text:", text.trim());

// 3. tool use
const tool = await client.messages.create({
    model,
    max_tokens: 128,
    tools: [
        {
            name: "get_weather",
            description: "Get weather for a city.",
            input_schema: {
                type: "object",
                properties: { city: { type: "string" } },
                required: ["city"],
            },
        },
    ],
    messages: [{ role: "user", content: "What's the weather in Paris? Use the tool." }],
});
line("tool-use", tool.content);

// 4. image
const image = await client.messages.create({
    model,
    max_tokens: 64,
    messages: [
        {
            role: "user",
            content: [
                { type: "text", text: "What colour is this pixel?" },
                {
                    type: "image",
                    source: {
                        type: "base64",
                        media_type: "image/png",
                        data: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                    },
                },
            ],
        },
    ],
});
line("image", image.content);

console.log("\nAll four Messages checks completed.");
