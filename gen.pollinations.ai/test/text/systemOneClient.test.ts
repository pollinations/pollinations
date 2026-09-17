import { afterEach, describe, expect, it, vi } from "vitest";
import { findModelByName } from "../../src/text/availableModels.js";
import { generateTextPortkey } from "../../src/text/generateTextPortkey.js";
import { callSystemOne } from "../../src/text/systemOneClient.js";
import type { TransformOptions } from "../../src/text/types.js";

const modelConfig = { "typesafe-api-key": "test-key", model: "jev-latest" };
const properties = {
    department: {
        type: "string",
        enum: ["billing", "technical"],
        description: "Which team?",
    },
    frustration: {
        type: "integer",
        enum: ["Calm", "Frustrated", "Very angry"],
        description: "How frustrated?",
    },
    is_urgent: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Is this urgent?",
    },
};
const response_format = {
    type: "json_schema",
    json_schema: { name: "triage", schema: { type: "object", properties } },
};
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
    it("resolves openjev without the retired public names", () => {
        expect(findModelByName("openjev")?.name).toBe("openjev");
        expect(findModelByName("jev")).toBeNull();
        expect(findModelByName("typesafe/jev")).toBeNull();
    });

    it("sends all question types in one call and maps answers and usage", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://api.typesafe.ai/v1/systemone",
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
                    model: "jev-latest",
                    state: "Route the request.\n\nMy payouts have failed\n\nfor 3 days.",
                    questions: {
                        department: {
                            type: "choice",
                            instructions: "Which team?",
                            criteria: {
                                billing: "billing",
                                technical: "technical",
                            },
                        },
                        frustration: {
                            type: "score",
                            instructions: "How frustrated?",
                            criteria: ["Calm", "Frustrated", "Very angry"],
                        },
                        is_urgent: {
                            type: "noul",
                            instructions: "Is this urgent?",
                        },
                    },
                });
                return Response.json({
                    model: "jev-1.13.0",
                    answers,
                    usage: { input_tokens: 312, output_tokens: 48 },
                });
            });
        const result = await callSystemOne(
            [
                { role: "system", content: "Route the request." },
                { role: "assistant", content: "" },
                {
                    role: "user",
                    content: [
                        { type: "text", text: "My payouts have failed" },
                        { type: "text", text: "for 3 days." },
                    ],
                },
                { role: "assistant", content: null },
            ],
            { modelConfig, response_format },
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
        ).toEqual({
            department: {
                choice: "technical",
                confidence: 0.85,
                probabilities: { billing: 0.08, technical: 0.92 },
            },
            frustration: {
                score: 1.6,
                legend: { "0": "Calm", "1": "Frustrated", "2": "Very angry" },
                confidence: 0.78,
                probabilities: { "0": 0.1, "1": 0.2, "2": 0.7 },
            },
            is_urgent: { noul: 0.98 },
        });
    });

    it("routes openjev directly with the configured upstream model", async () => {
        const fetchSpy = vi
            .spyOn(globalThis, "fetch")
            .mockImplementationOnce(async (input, init) => {
                expect(String(input)).toBe(
                    "https://api.typesafe.ai/v1/systemone",
                );
                expect(JSON.parse(String(init?.body))).toMatchObject({
                    model: "jev-1.13.0",
                    state: "Payment failed.",
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
            [
                {
                    role: "user",
                    content: [{ type: "text", text: "Payment failed." }],
                },
            ],
            {
                model: "openjev",
                modelConfig: { ...modelConfig, model: "jev-1.13.0" },
                response_format,
            },
            portkeyFetcher,
        );
        expect(fetchSpy).toHaveBeenCalledTimes(1);
        expect(portkeyFetcher).not.toHaveBeenCalled();
    });

    it("rejects streaming before fetching or checking credentials", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(callSystemOne([], { stream: true })).rejects.toMatchObject(
            { status: 400, message: "openjev does not support streaming." },
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("reports missing credentials as server misconfiguration", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callSystemOne([], { response_format }),
        ).rejects.toMatchObject({
            status: 500,
            message: "TypeSafe credentials are not configured for openjev.",
        });
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        undefined,
        { type: "text" },
        { type: "json_object" },
    ])("diagnoses an absent or wrong format: %j", async (format) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        await expect(
            callSystemOne([], { modelConfig, response_format: format }),
        ).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(
                'response_format.type to be "json_schema"',
            ),
        });
        await expect(
            callSystemOne([], { modelConfig, response_format: format }),
        ).rejects.toThrow('"response_format":{"type":"json_schema"');
        await expect(
            callSystemOne([], { modelConfig, response_format: format }),
        ).rejects.toThrow("https://gen.pollinations.ai/docs#tag/text");
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        undefined,
        null,
        [],
        "wrong",
        12,
    ])("diagnoses missing or malformed properties: %j", async (value) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const options: TransformOptions = {
            modelConfig,
            response_format: {
                type: "json_schema",
                json_schema: { schema: { properties: value } },
            },
        };
        await expect(callSystemOne([], options)).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining(
                "response_format.json_schema.schema.properties",
            ),
        });
        await expect(callSystemOne([], options)).rejects.toThrow(
            '"properties":{"urgent":{"type":"number","minimum":0,"maximum":1}}',
        );
        await expect(callSystemOne([], options)).rejects.toThrow(
            "https://gen.pollinations.ai/docs#tag/text",
        );
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it.each([
        { type: "boolean" },
        { type: "string", enum: [1, 2] },
        { type: "integer", enum: ["Only"] },
        null,
    ])("names the unsupported property and shows valid alternatives: %j", async (property) => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");
        const options = {
            modelConfig,
            response_format: {
                type: "json_schema",
                json_schema: {
                    schema: { properties: { invalid_question: property } },
                },
            },
        };
        await expect(callSystemOne([], options)).rejects.toMatchObject({
            status: 400,
            message: expect.stringContaining('property "invalid_question"'),
        });
        await expect(callSystemOne([], options)).rejects.toThrow(
            'choice: {"type":"string","enum":["billing","technical"]}',
        );
        await expect(callSystemOne([], options)).rejects.toThrow(
            "https://gen.pollinations.ai/docs#tag/text",
        );
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
            callSystemOne([], { modelConfig, response_format }),
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
            callSystemOne([], { modelConfig, response_format }),
        ).rejects.toMatchObject({ status: 502 });
    });
});
