import { env } from "cloudflare:test";
import { load } from "js-yaml";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { requireChatStreamUsage } from "../../src/text/chat/usage.ts";
import { syncTextEnvironment } from "../../src/text/environment.ts";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.ts";
import {
    finalMidiJourneyMessage,
    formatMidiJourneyResult,
    isLegacyMidiJourney,
} from "../../src/text/midijourney.ts";
import { callChatViaResponses } from "../../src/text/responses/chatClient.ts";
import { responsesToChatCompletion } from "../../src/text/responses/chatResponse.ts";
import { generateCacheKey } from "../../src/utils/text-cache.ts";
import { csvToAbleton } from "../fixtures/midijourney/csv.ts";
import { textToClip as v1 } from "../fixtures/midijourney/v1.ts";
import { textToClip as v2 } from "../fixtures/midijourney/v2.ts";

// Deliberately unsorted, simultaneous, fractional and repeated notes.
const notation =
    "pitch,time,duration,velocity\n38,0,0.75,70\n41,1.25,0.5,95\n60,0,0.333333,80\n60,0,0.333333,80\n127,2.5,0.125,126";
const clip = {
    title: "Bass phrase",
    duration: 8,
    key: "D minor",
    explanation: "Two syncopated notes. 🎹",
    notation,
};
const raw = stringify(clip);
const fenced = `Here is the clip:\n\n\`\`\`yaml\n${raw}\`\`\`\nEnjoy!`;
const usage = { prompt_tokens: 9, completion_tokens: 4, total_tokens: 13 };
const models = [
    "midijourney",
    "pollinations/midijourney",
    "midijourney-large",
    "pollinations/midijourney-large",
];
const message = (text: string) => ({
    type: "message",
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text }],
});

beforeEach(() => {
    syncTextEnvironment(env);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("MIDIjourney historical device contract", () => {
    it("reproduces the V1 fences and V2 first-block failures", () => {
        expect(() => v1(fenced)).toThrow();
        expect(v2(fenced).notation).toBe(notation);
        expect(() => v2(`\`\`\`json\n{}\n\`\`\`\n${fenced}`)).toThrow();
    });
    it.each([
        raw,
        fenced,
    ])("round trips every field and note through both historical parsers", (text) => {
        const result = formatMidiJourneyResult(text);
        expect(result).not.toContain("```");
        expect(load(result)).toEqual(clip);
        for (const parse of [v1, v2]) {
            expect(parse(result)).toEqual(clip);
            expect(csvToAbleton(parse(result).notation)).toEqual([
                { pitch: 38, start_time: 0, duration: 0.75, velocity: 70 },
                { pitch: 41, start_time: 1.25, duration: 0.5, velocity: 95 },
                { pitch: 60, start_time: 0, duration: 0.333333, velocity: 80 },
                { pitch: 60, start_time: 0, duration: 0.333333, velocity: 80 },
                { pitch: 127, start_time: 2.5, duration: 0.125, velocity: 126 },
            ]);
        }
    });
    it("preserves notes affected by pre-existing decoder quirks", () => {
        const csv =
            "pitch,time,duration,velocity\n0,0,1,80\n60,1,1,127\n61,2,1,0";
        const result = formatMidiJourneyResult(
            stringify({ title: "Quirks", notation: csv }),
        );
        for (const parse of [v1, v2]) {
            expect(parse(result).notation).toBe(csv);
            expect(csvToAbleton(parse(result).notation)).toEqual([
                { pitch: 60, start_time: 1, duration: 1, velocity: 126 },
                { pitch: 61, start_time: 2, duration: 1, velocity: 100 },
            ]);
        }
    });
    it("allows omitted optional fields and preserves trailing newlines", () => {
        const value = { title: "Minimal", notation: `${notation}\n` };
        expect(load(formatMidiJourneyResult(stringify(value)))).toEqual(value);
    });
    it.each([
        { ...clip, title: " " },
        { ...clip, notation: [] },
        { ...clip, notation: "38,0,1,80" },
        { ...clip, notation: "time,pitch,duration,velocity\n0,38,1,80" },
        { ...clip, notation: `${notation}\n60,NaN,1,80` },
        { ...clip, notation: `${notation}\n60,0,0,80` },
        { ...clip, notation: `${notation}\n60,0,1` },
        { ...clip, notation: `${notation}\n128,0,1,80` },
        { ...clip, notation: `${notation}\n60,-1,1,80` },
        { ...clip, duration: "8" },
    ])("rejects malformed payloads without silently repairing notes", (value) => {
        expect(() => formatMidiJourneyResult(stringify(value))).toThrow();
    });
    it.each([
        "Hello!",
        `${raw}\n---\n${raw}`,
        `${fenced}\n${fenced}`,
        "title: a\ntitle: b\nnotation: x",
        `${raw}\nunfinished prose`,
    ])("rejects missing, ambiguous or invalid YAML", (value) => {
        expect(() => formatMidiJourneyResult(value)).toThrow();
    });
    it("selects only the final assistant message after tool output", () => {
        const earlier = stringify({ ...clip, title: "Wrong earlier clip" });
        const output = [
            message(earlier),
            { type: "function_call_output", output: earlier },
            message(fenced),
        ];
        expect(load(finalMidiJourneyMessage(output))).toEqual(clip);
        expect(() => finalMidiJourneyMessage(output.slice(0, -1))).toThrow();
        expect(() =>
            finalMidiJourneyMessage([
                ...output,
                message("Let's discuss this instead."),
            ]),
        ).toThrow();
    });
    it("keeps direct agent conversation and tool/media transcripts", () => {
        const output = [
            {
                type: "function_call",
                call_id: "a",
                name: "render",
                arguments: "{}",
                status: "completed",
            },
            {
                type: "function_call_output",
                call_id: "a",
                output: "https://example.com/song.wav",
            },
            message(fenced),
        ];
        const response = {
            status: "completed",
            output,
            usage: { input_tokens: 9, output_tokens: 4, total_tokens: 13 },
        };
        const direct = responsesToChatCompletion(
            response,
            "community/pollinations-ai/midijourney",
            new URL("https://agent.test"),
        );
        expect(direct.choices?.[0].message?.content).toContain("song.wav");
        expect(direct.choices?.[0].message?.content).toContain(fenced);
        const legacy = responsesToChatCompletion(
            response,
            models[0],
            new URL("https://agent.test"),
            { legacyMidi: true },
        );
        expect(load(legacy.choices?.[0].message?.content as string)).toEqual(
            clip,
        );
        expect(legacy.usage).toMatchObject(usage);
    });
    it.each(models)("resolves legacy alias %s", (model) =>
        expect(isLegacyMidiJourney(model)).toBe(true));
    it.each([
        "community/pollinations-ai/midijourney",
        "community/pollinations-router/midijourney",
        "openai/gpt-5.5",
        undefined,
    ])("does not format %s", (model) =>
        expect(isLegacyMidiJourney(model)).toBe(false));
});

describe("MIDIjourney gateway envelopes", () => {
    it.each(
        models.flatMap((model) =>
            [false, true].map((stream) => ({ model, stream })),
        ),
    )("formats $model stream=$stream with usage preserved", async ({
        model,
        stream,
    }) => {
        const completion = await generateTextPortkey(
            [{ role: "user", content: "Bass phrase" }],
            { model, stream },
            async (_input, init) => {
                const request = JSON.parse(String(init?.body));
                expect(request.stream).toBe(false);
                expect(request.stream_options).toBeUndefined();
                return Response.json({
                    id: "midi-test",
                    model: "provider",
                    choices: [
                        {
                            index: 0,
                            message: { role: "assistant", content: fenced },
                            finish_reason: "stop",
                        },
                    ],
                    usage,
                });
            },
        );
        expect(completion.usage).toEqual(usage);
        if (!stream) {
            expect(
                load(completion.choices?.[0].message?.content as string),
            ).toEqual(clip);
            return;
        }
        if (!completion.responseStream) throw new Error("Missing SSE body");
        const body = await new Response(
            requireChatStreamUsage(completion.responseStream),
        ).text();
        expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
        const events = body
            .trim()
            .split("\n\n")
            .slice(0, -1)
            .map((line) => JSON.parse(line.slice(6)));
        const content = events
            .flatMap((event) => event.choices)
            .map((choice) => choice.delta.content ?? "")
            .join("");
        expect(v1(content)).toEqual(clip);
        expect(events.at(-1).usage).toEqual(usage);
        expect(events[0].choices[0].finish_reason).toBe("stop");
    });
    it.each([
        "length",
        "content_filter",
        "tool_calls",
    ])("rejects %s before sending partial YAML", async (finish_reason) => {
        await expect(
            generateTextPortkey(
                [{ role: "user", content: "Bass" }],
                { model: "midijourney", stream: true },
                async () =>
                    Response.json({
                        choices: [
                            {
                                message: { role: "assistant", content: raw },
                                finish_reason,
                            },
                        ],
                        usage,
                    }),
            ),
        ).rejects.toThrow("complete, valid musical result");
    });
});

describe("managed agent legacy adapter", () => {
    it.each([
        false,
        true,
    ])("buffers and extracts the final result stream=%s", async (stream) => {
        const completion = await callChatViaResponses(
            [{ role: "user", content: "Bass" }],
            {
                model: "managed-agent-id",
                requestedModel: "midijourney",
                stream,
                modelConfig: {
                    responsesEndpoint: "https://agent.test/v1/responses",
                    authKey: "test-only",
                },
            },
            async (_input, init) => {
                expect(JSON.parse(String(init?.body)).stream).toBe(false);
                return Response.json({
                    status: "completed",
                    output: [
                        message("Earlier commentary with a code block"),
                        {
                            type: "function_call",
                            call_id: "a",
                            name: "render",
                            arguments: "{}",
                            status: "completed",
                        },
                        {
                            type: "function_call_output",
                            call_id: "a",
                            output: "```yaml\ntitle: Wrong clip\nnotation: bad\n```",
                        },
                        message(fenced),
                    ],
                    usage: {
                        input_tokens: 9,
                        output_tokens: 4,
                        total_tokens: 13,
                    },
                });
            },
        );
        expect(
            load(completion.choices?.[0].message?.content as string),
        ).toEqual(clip);
        expect(completion.usage).toMatchObject(usage);
        if (stream) {
            if (!completion.responseStream) throw new Error("Missing SSE");
            const body = await new Response(
                requireChatStreamUsage(completion.responseStream),
            ).text();
            expect(body).not.toContain("Wrong clip");
            expect(body.endsWith("data: [DONE]\n\n")).toBe(true);
        }
    });
});

it("escapes fenced code in metadata so V2 cannot misidentify it as the result", () => {
    const value = {
        ...clip,
        explanation: "Example: ```yaml\nnot a clip\n```",
        title: "A `bass`",
    };
    const output = formatMidiJourneyResult(stringify(value));
    expect(output).not.toContain("`");
    expect(v1(output)).toEqual(value);
    expect(v2(output)).toEqual(value);
});
it("rejects an earlier valid YAML block followed by an invalid final block", () => {
    expect(() =>
        formatMidiJourneyResult(
            `${fenced}\n\n\`\`\`yaml\ntitle: unfinished\n\`\`\``,
        ),
    ).toThrow();
});

it.each([
    ...models,
    "community/pollinations-ai/midijourney",
])("invalidates only old legacy caches: %s", async (model) => {
    for (const method of ["GET", "POST"]) {
        const path = method === "GET" ? "/text/bass" : "/v1/chat/completions";
        const query =
            method === "GET" ? new URLSearchParams({ model }).toString() : "";
        const body = method === "POST" ? JSON.stringify({ model }) : undefined;
        const request = new Request(
            `https://gen.test${path}${query ? `?${query}` : ""}`,
            { method },
        );
        const oldInput = [method, path, query, ...(body ? [body] : [])].join(
            "|",
        );
        const oldHash = Array.from(
            new Uint8Array(
                await crypto.subtle.digest(
                    "SHA-256",
                    new TextEncoder().encode(oldInput),
                ),
            ),
        )
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
        const key = await generateCacheKey(request, body);
        expect(key === oldHash).toBe(model.startsWith("community/"));
    }
});
