import { describe, expect, it } from "vitest";
import { CreateChatCompletionRequestSchema } from "../../../../shared/schemas/openai.ts";
import { findModelByName } from "../../../src/text/availableModels.js";
import midijourneyPrompt from "../../../src/text/personas/midijourney.js";
import { getChatRequestData } from "../../../src/text/requestUtils.js";
import {
    normalizeOptions,
    prepareMessages,
} from "../../../src/text/textGenerationUtils.js";
import { createMessageTransform } from "../../../src/text/transforms/createMessageTransform.js";
import type { ChatMessage } from "../../../src/text/types.js";

describe("createMessageTransform", () => {
    const transform = createMessageTransform("Music persona");

    it("merges system text parts and messages in order without changing the input", async () => {
        const messages: ChatMessage[] = [
            { role: "system", content: "Play quietly" },
            {
                role: "system",
                content: [
                    { type: "text", text: "Compose in D-flat major" },
                    { type: "text", text: "Use 7/8 time" },
                ],
            },
            { role: "user", content: [{ type: "text", text: "Four bars" }] },
            { role: "system", content: [{ type: "text", text: "No drums" }] },
            { role: "assistant", content: null, tool_calls: [{ id: "call" }] },
            { role: "tool", content: "done", tool_call_id: "call" },
        ];
        const original = structuredClone(messages);
        const options = { max_tokens: 120, temperature: 0.7 };

        const result = await transform(messages, options);

        expect(result.messages[0]).toEqual({
            role: "system",
            content:
                "Music persona\n\nPlay quietly\n\nCompose in D-flat major\nUse 7/8 time\n\nNo drums",
        });
        expect(result.messages.slice(1)).toEqual([
            messages[2],
            messages[4],
            messages[5],
        ]);
        expect(result.messages[1]).toBe(messages[2]);
        expect(result.options).toBe(options);
        expect(messages).toEqual(original);
        expect(options).toEqual({ max_tokens: 120, temperature: 0.7 });
    });

    it.each([
        { messages: [], content: "Music persona" },
        {
            messages: [{ role: "system", content: null }],
            content: "Music persona",
        },
        {
            messages: [{ role: "system" }],
            content: "Music persona",
        },
        {
            messages: [{ role: "system", content: "Play quietly" }],
            content: "Music persona\n\nPlay quietly",
        },
    ])("preserves string and absent-content behavior for $messages", async ({
        messages,
        content,
    }) => {
        expect((await transform(messages, {})).messages).toEqual([
            { role: "system", content },
        ]);
    });
});

describe.each([
    "pollinations/midijourney",
    "pollinations/midijourney-large",
])("%s system content", (model) => {
    it.each([
        {
            systemContent: [{ type: "text", text: "D-flat major" }],
            suffix: "D-flat major",
        },
        {
            systemContent: [
                { type: "text", text: "D-flat major" },
                { type: "text", text: "Use 7/8 time" },
            ],
            suffix: "D-flat major\nUse 7/8 time",
        },
        { systemContent: "D-flat major", suffix: "D-flat major" },
    ])("preserves supplied system content $systemContent", async ({
        systemContent,
        suffix,
    }) => {
        const body = CreateChatCompletionRequestSchema.parse({
            model,
            messages: [
                { role: "system", content: "Play quietly" },
                { role: "system", content: systemContent },
                {
                    role: "user",
                    content: [{ type: "text", text: "Four bars" }],
                },
            ],
            temperature: 0.7,
            top_p: 0.9,
            max_tokens: 120,
        });
        const original = structuredClone(body);
        const { messages, ...options } = getChatRequestData(body);
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const result = await transform(messages, normalizeOptions(options));
        const prepared = prepareMessages(result.messages);

        expect(prepared).toEqual([
            {
                role: "system",
                content: `${midijourneyPrompt}\n\nPlay quietly\n\n${suffix}`,
            },
            body.messages[2],
        ]);
        expect(result.options.max_tokens).toBe(120);
        expect(result.options.temperature).toBeUndefined();
        expect(result.options.top_p).toBeUndefined();
        expect(body).toEqual(original);
    });

    it.each([
        undefined,
        "D-flat major",
    ])("keeps the persona and optional top-level system prompt (%s)", async (system) => {
        const body = CreateChatCompletionRequestSchema.parse({
            model,
            system,
            messages: [
                {
                    role: "user",
                    content: [{ type: "text", text: "Four bars" }],
                },
            ],
            max_tokens: 120,
        });
        const { messages, ...options } = getChatRequestData(body);
        const transform = findModelByName(model)?.transform;
        if (!transform) throw new Error(`${model} transform missing`);

        const result = await transform(messages, normalizeOptions(options));

        expect(prepareMessages(result.messages)).toEqual([
            {
                role: "system",
                content: system
                    ? `${midijourneyPrompt}\n\n${system}`
                    : midijourneyPrompt,
            },
            body.messages[0],
        ]);
        expect(result.options.max_tokens).toBe(120);
    });
});
