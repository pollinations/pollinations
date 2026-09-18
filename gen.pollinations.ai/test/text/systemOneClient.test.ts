import { afterEach, describe, expect, it, vi } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";
import { requireChatStreamUsage } from "../../src/text/chat/usage.js";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";
import { callSystemOne } from "../../src/text/systemOneClient.js";

const modelConfig = {
    authKey: "test-key",
    directEndpoint: "https://openrouter.ai/api/alpha/decisions",
    model: "typesafe/jev-1.13",
};

// Native TypeSafe shapes: instructions and rubric entries may be strings,
// objects, or arrays; the adapter must forward them untouched.
const nativeState = {
    ticket: { subject: "Duplicate charge", messages: ["Charged twice."] },
};
const nativeQuestions = {
    department: {
        type: "choice",
        instructions: "Which team should handle this?",
        criteria: {
            billing: "Payment issues",
            technical: "Product failures",
        },
    },
    frustration: {
        type: "score",
        instructions: { question: "How frustrated?", scale: "Calm to angry" },
        criteria: [
            "Calm",
            { level: "Frustrated", example: "Repeated contact" },
            "Very angry",
        ],
    },
    is_urgent: {
        type: "noul",
        instructions: "Does this convey urgency?",
        criteria: {
            true: "Explicitly time-sensitive",
            false: "No urgency expressed",
        },
    },
};
const nativeContent = JSON.stringify({
    state: nativeState,
    questions: nativeQuestions,
});

const answers = {
    department: {
        type: "choice",
        choice: "technical",
        confidence: 0.85,
        probabilities: { billing: 0.08, technical: 0.92 },
    },
    frustration: {
        type: "score",
        score: 1.6,
        legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
        confidence: 0.78,
        probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
    },
    is_urgent: { type: "noul", noul: 0.98 },
};

afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
});

describe("System One adapter", () => {
    it("resolves the canonical name and the jev alias", () => {
        expect(findModelByName("typesafe/jev")?.name).toBe("typesafe/jev");
        expect(findModelByName("jev")?.name).toBe("typesafe/jev");
    });

    it("forwards native state and questions in one message and returns native answers", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://openrouter.ai/api/alpha/decisions",
                );
                expect(init?.method).toBe("POST");
                expect(new Headers(init?.headers).get("authorization")).toBe(
                    "Bearer test-key",
                );
                expect(new Headers(init?.headers).get("content-type")).toBe(
                    "application/json",
                );
                expect(init?.signal).toBeInstanceOf(AbortSignal);
                expect(JSON.parse(String(init?.body))).toEqual({
                    model: "typesafe/jev-1.13",
                    state: nativeState,
                    questions: nativeQuestions,
                });
                return Response.json({
                    model: "jev-1.13.0",
                    answers,
                    usage: { input_tokens: 312, output_tokens: 48 },
                });
            });
        const result = await callSystemOne(
            [{ role: "user", content: nativeContent }],
            { modelConfig },
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(result).toMatchObject({
            id: expect.stringMatching(/^systemone-/),
            object: "chat.completion",
            created: expect.any(Number),
            model: "jev-1.13.0",
            choices: [
                {
                    index: 0,
                    finish_reason: "stop",
                    message: { role: "assistant", content: expect.any(String) },
                },
            ],
            usage: {
                prompt_tokens: 312,
                completion_tokens: 48,
                total_tokens: 360,
            },
        });
        expect(
            JSON.parse(String(result.choices?.[0]?.message?.content)),
        ).toEqual(answers);
        // Internal routing metadata must not reach the OpenAI response body.
        expect(result.upstreamRequestUrl?.href).toBe(
            "https://openrouter.ai/api/alpha/decisions",
        );
        expect(JSON.parse(JSON.stringify(result))).not.toHaveProperty(
            "upstreamRequestUrl",
        );
    });

    it("routes typesafe/jev directly with the configured upstream model", async () => {
        const payloadWithModel = JSON.stringify({
            model: "inner-model-must-not-route",
            state: nativeState,
            questions: nativeQuestions,
        });
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://openrouter.ai/api/alpha/decisions",
                );
                expect(JSON.parse(String(init?.body))).toEqual({
                    model: "jev-1.13.0",
                    state: nativeState,
                    questions: nativeQuestions,
                });
                expect(
                    new Headers(init?.headers).get("x-portkey-provider"),
                ).toBeNull();
                return Response.json({
                    model: "jev-1.13.0",
                    answers,
                    usage: { input_tokens: 312, output_tokens: 48 },
                });
            });
        const portkeyFetcher = vi.fn();
        await generateTextPortkey(
            [{ role: "user", content: payloadWithModel }],
            {
                model: "typesafe/jev",
                modelConfig: { ...modelConfig, model: "jev-1.13.0" },
            },
            portkeyFetcher,
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(portkeyFetcher).not.toHaveBeenCalled();
    });

    it("wraps the finished answers in an SSE stream with terminal usage", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({
                model: "jev-1.13.0",
                answers,
                usage: { input_tokens: 312, output_tokens: 48 },
            }),
        );
        const result = await callSystemOne(
            [{ role: "user", content: nativeContent }],
            { modelConfig, stream: true },
        );
        expect(result.stream).toBe(true);
        // The same validator billing runs the stream through; it appends an
        // error event instead of the terminator when usage is missing.
        const body = await new Response(
            requireChatStreamUsage(
                result.responseStream as ReadableStream<
                    Uint8Array<ArrayBuffer>
                >,
            ),
        ).text();
        expect(body).not.toContain("usage_missing");
        const events = body
            .split("\n\n")
            .filter(Boolean)
            .map((event) => event.replace(/^data: /, ""));
        expect(events.at(-1)).toBe("[DONE]");
        const chunks = events.slice(0, -1).map((event) => JSON.parse(event));
        expect(chunks).toHaveLength(2);
        expect(chunks[0]).toMatchObject({
            object: "chat.completion.chunk",
            model: "jev-1.13.0",
            choices: [
                {
                    index: 0,
                    finish_reason: "stop",
                    delta: { role: "assistant" },
                },
            ],
            usage: null,
        });
        expect(JSON.parse(chunks[0].choices[0].delta.content)).toEqual(answers);
        expect(chunks[1]).toMatchObject({
            choices: [],
            usage: {
                prompt_tokens: 312,
                completion_tokens: 48,
                total_tokens: 360,
            },
        });
    });

    it.each([
        [
            "a system message",
            [
                { role: "system", content: "Route the request." },
                { role: "user", content: nativeContent },
            ],
        ],
        [
            "an earlier conversation turn",
            [
                { role: "user", content: "hello" },
                { role: "assistant", content: "hi" },
                { role: "user", content: nativeContent },
            ],
        ],
    ])("reads the last user message past %s", async (_name, messages) => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (_input, init) => {
                expect(JSON.parse(String(init?.body))).toEqual({
                    model: "typesafe/jev-1.13",
                    state: nativeState,
                    questions: nativeQuestions,
                });
                return Response.json({
                    model: "jev-1.13.0",
                    answers,
                    usage: { input_tokens: 312, output_tokens: 48 },
                });
            });
        await callSystemOne(messages, { modelConfig });
        expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it.each([
        ["no messages", []],
        [
            "non-string content",
            [
                {
                    role: "user",
                    content: [{ type: "text", text: nativeContent }],
                },
            ],
        ],
        ["no user message", [{ role: "assistant", content: nativeContent }]],
    ])("rejects an unsupported message layout: %s", async (_name, messages) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callSystemOne(messages, { modelConfig }),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining("a user message"),
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        ["not json", "not json"],
        ["an array", "[]"],
        ["missing state", '{"questions":{}}'],
        ["missing questions", '{"state":"Payment failed."}'],
    ])("rejects a malformed native payload: %s", async (_name, content) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callSystemOne([{ role: "user", content }], { modelConfig }),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining("https://docs.typesafe.ai/api"),
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("reports missing credentials as server misconfiguration", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callSystemOne([{ role: "user", content: nativeContent }], {}),
        ).rejects.toMatchObject({
            status: 500,
            message: "The decisions route is not configured for typesafe/jev.",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("preserves upstream status and sanitized response headers", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            new Response("quota exceeded", {
                status: 429,
                headers: {
                    "retry-after": "10",
                    "x-api-key": "upstream-test-key",
                },
            }),
        );
        await expect(
            callSystemOne([{ role: "user", content: nativeContent }], {
                modelConfig,
            }),
        ).rejects.toMatchObject({
            status: 502,
            upstreamStatus: 429,
            message: "quota exceeded",
            responseBody: "quota exceeded",
            upstreamHeaders: { "retry-after": "10", "x-api-key": "[redacted]" },
        });
    });

    it("rejects a success response that omits usage", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
            Response.json({ model: "jev-1.13.0", answers }),
        );
        await expect(
            callSystemOne([{ role: "user", content: nativeContent }], {
                modelConfig,
            }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
