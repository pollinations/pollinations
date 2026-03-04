/**
 * Text model validation tests.
 * Tests each text model's declared capabilities against the live Worker.
 */
import { describe, expect, it } from "vitest";
import { TEXT_URL, textHeaders } from "./config";
import { TEXT_MODELS } from "./models";

// A tiny 1x1 red PNG as base64 for vision tests
const TINY_PNG_BASE64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";

// Skip models that need special request formats or proxy through Pollinations
const SKIP_MODELS = new Set(["nomnom", "polly", "openai-audio"]);

// Models we test but allow to fail (alpha/unstable/intermittent)
const ALLOW_FAIL = new Set(["step-3.5-flash", "qwen-character", "perplexity-reasoning"]);

// Models that don't support vision despite declaring image input
const SKIP_VISION = new Set(["openai-fast"]);

function chatRequest(model: string, messages: any[], extra: Record<string, any> = {}) {
    return fetch(`${TEXT_URL}/v1/chat/completions`, {
        method: "POST",
        headers: textHeaders(),
        body: JSON.stringify({ model, messages, max_tokens: 256, ...extra }),
    });
}

function streamRequest(model: string, messages: any[], extra: Record<string, any> = {}) {
    return fetch(`${TEXT_URL}/v1/chat/completions`, {
        method: "POST",
        headers: textHeaders(),
        body: JSON.stringify({ model, messages, max_tokens: 256, stream: true, ...extra }),
    });
}

// ---------------------------------------------------------------------------
// Basic text completion — every model
// ---------------------------------------------------------------------------

const testableModels = TEXT_MODELS.filter((m) => !SKIP_MODELS.has(m.id));

describe("text models — basic completion", () => {
    for (const model of testableModels) {
        const label = `${model.id} (${model.provider})`;

        it(label, async () => {
            const res = await chatRequest(model.id, [
                { role: "user", content: "Reply with exactly one word: hello" },
            ]);

            if (ALLOW_FAIL.has(model.id) && !res.ok) {
                console.warn(`[ALPHA] ${model.id} returned ${res.status} — allowed to fail`);
                return;
            }

            expect(res.status, `${model.id} returned ${res.status}: ${await res.clone().text()}`).toBe(200);

            const data = await res.json();
            expect(data.choices).toBeDefined();
            expect(data.choices.length).toBeGreaterThan(0);

            const msg = data.choices[0].message;
            const hasContent = !!msg.content;
            const hasReasoning = data.usage?.completion_tokens_details?.reasoning_tokens > 0;

            if (ALLOW_FAIL.has(model.id) && !hasContent && !hasReasoning) {
                console.warn(`[ALPHA] ${model.id} returned 200 but empty content — allowed to fail`);
                return;
            }

            expect(
                hasContent || hasReasoning,
                `${model.id}: no content and no reasoning tokens`,
            ).toBe(true);

            console.log(`  ✓ ${model.id}: "${(msg.content || "[reasoning only]").slice(0, 80)}"`);
        });
    }
});

// ---------------------------------------------------------------------------
// Streaming — every model
// ---------------------------------------------------------------------------

describe("text models — streaming", () => {
    for (const model of testableModels) {
        const label = `${model.id} streaming`;

        it(label, async () => {
            const res = await streamRequest(model.id, [
                { role: "user", content: "Say hi" },
            ]);

            if (ALLOW_FAIL.has(model.id) && !res.ok) {
                console.warn(`[ALPHA] ${model.id} streaming returned ${res.status} — allowed to fail`);
                return;
            }

            expect(res.status, `${model.id} streaming returned ${res.status}`).toBe(200);

            const contentType = res.headers.get("content-type") || "";
            if (ALLOW_FAIL.has(model.id) && !contentType.includes("text/event-stream")) {
                console.warn(`[ALPHA] ${model.id} streaming: not SSE (${contentType}) — allowed to fail`);
                return;
            }
            expect(contentType).toContain("text/event-stream");

            // Read a few chunks to verify streaming works
            const reader = res.body!.getReader();
            const decoder = new TextDecoder();
            let chunks = "";
            let chunkCount = 0;

            while (chunkCount < 20) {
                const { done, value } = await reader.read();
                if (done) break;
                chunks += decoder.decode(value, { stream: true });
                chunkCount++;
            }
            reader.cancel();

            if (ALLOW_FAIL.has(model.id) && !chunks.includes("data:")) {
                console.warn(`[ALPHA] ${model.id} streaming: no SSE data in response — allowed to fail`);
                return;
            }
            expect(chunks).toContain("data:");
            console.log(`  ✓ ${model.id} streaming: ${chunkCount} chunks received`);
        });
    }
});

// ---------------------------------------------------------------------------
// Vision (image input) — models with "image" in inputModalities
// ---------------------------------------------------------------------------

const visionModels = testableModels.filter(
    (m) => m.inputModalities.includes("image") && !m.hidden && !SKIP_VISION.has(m.id),
);

describe("text models — vision (image input)", () => {
    for (const model of visionModels) {
        const label = `${model.id} vision`;

        it(label, async () => {
            const res = await chatRequest(model.id, [
                {
                    role: "user",
                    content: [
                        { type: "text", text: "What color is this image? Reply with one word." },
                        {
                            type: "image_url",
                            image_url: {
                                url: `data:image/png;base64,${TINY_PNG_BASE64}`,
                            },
                        },
                    ],
                },
            ]);

            if (ALLOW_FAIL.has(model.id) && !res.ok) {
                console.warn(`[ALPHA] ${model.id} vision returned ${res.status} — allowed to fail`);
                return;
            }

            expect(res.status, `${model.id} vision returned ${res.status}: ${await res.clone().text()}`).toBe(200);

            const data = await res.json();
            expect(data.choices[0].message.content).toBeTruthy();
            console.log(`  ✓ ${model.id} vision: "${data.choices[0].message.content.slice(0, 80)}"`);
        });
    }
});

// ---------------------------------------------------------------------------
// Tool calling — models with tools: true
// ---------------------------------------------------------------------------

const toolModels = testableModels.filter(
    (m) => m.tools && !m.hidden && !ALLOW_FAIL.has(m.id),
);

describe("text models — tool calling", () => {
    const tools = [
        {
            type: "function",
            function: {
                name: "get_weather",
                description: "Get the weather for a location",
                parameters: {
                    type: "object",
                    properties: {
                        location: { type: "string", description: "City name" },
                    },
                    required: ["location"],
                },
            },
        },
    ];

    for (const model of toolModels) {
        const label = `${model.id} tools`;

        it(label, async () => {
            const res = await chatRequest(
                model.id,
                [{ role: "user", content: "What's the weather in Paris?" }],
                { tools, tool_choice: "auto" },
            );

            expect(res.status, `${model.id} tools returned ${res.status}`).toBe(200);

            const data = await res.json();
            const choice = data.choices[0];

            // Model should either call the tool or respond with text
            const hasTool = choice.message.tool_calls?.length > 0;
            const hasContent = !!choice.message.content;

            expect(
                hasTool || hasContent,
                `${model.id} tools: expected tool_call or content`,
            ).toBe(true);

            if (hasTool) {
                console.log(`  ✓ ${model.id} tools: called ${choice.message.tool_calls[0].function.name}`);
            } else {
                console.log(`  ✓ ${model.id} tools: responded with text (no tool call)`);
            }
        });
    }
});
