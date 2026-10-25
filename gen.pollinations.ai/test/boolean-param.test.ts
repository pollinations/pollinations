import { describe, expect, it } from "vitest";
import { GenerateImageRequestQueryParamsSchema } from "@/schemas/image.ts";
import { GenerateTextRequestQueryParamsSchema } from "@/schemas/text.ts";
import { parseBooleanLike } from "@/util.ts";

describe("parseBooleanLike", () => {
    it("parses boolean-ish tokens", () => {
        expect(parseBooleanLike(true)).toBe(true);
        expect(parseBooleanLike(false)).toBe(false);
        expect(parseBooleanLike(1)).toBe(true);
        expect(parseBooleanLike(0)).toBe(false);
        expect(parseBooleanLike("true")).toBe(true);
        expect(parseBooleanLike(" TRUE ")).toBe(true);
        expect(parseBooleanLike("1")).toBe(true);
        expect(parseBooleanLike("yes")).toBe(true);
        expect(parseBooleanLike("on")).toBe(true);
        expect(parseBooleanLike("false")).toBe(false);
        expect(parseBooleanLike("0")).toBe(false);
        expect(parseBooleanLike("no")).toBe(false);
        expect(parseBooleanLike("off")).toBe(false);
        expect(parseBooleanLike("")).toBe(false);
    });

    it("returns null for unrecognized values", () => {
        expect(parseBooleanLike("banana")).toBeNull();
        expect(parseBooleanLike(undefined)).toBeNull();
        expect(parseBooleanLike(null)).toBeNull();
        expect(parseBooleanLike({})).toBeNull();
    });
});

describe("GenerateTextRequestQueryParamsSchema booleans", () => {
    it('treats "false" as false for stream and json', () => {
        const parsed = GenerateTextRequestQueryParamsSchema.parse({
            stream: "false",
            json: "false",
        });
        expect(parsed.stream).toBe(false);
        expect(parsed.json).toBe(false);
    });

    it('treats "true"/"1" as true and defaults to false', () => {
        const parsed = GenerateTextRequestQueryParamsSchema.parse({
            stream: "true",
            json: "1",
        });
        expect(parsed.stream).toBe(true);
        expect(parsed.json).toBe(true);
        const defaults = GenerateTextRequestQueryParamsSchema.parse({});
        expect(defaults.stream).toBe(false);
        expect(defaults.json).toBe(false);
    });

    it("rejects unrecognized boolean values", () => {
        expect(() =>
            GenerateTextRequestQueryParamsSchema.parse({ stream: "banana" }),
        ).toThrow();
    });
});

describe("GenerateImageRequestQueryParamsSchema booleans", () => {
    it("parses transparent and audio like the text route", () => {
        const parsed = GenerateImageRequestQueryParamsSchema.parse({
            transparent: "yes",
            audio: "0",
        });
        expect(parsed.transparent).toBe(true);
        expect(parsed.audio).toBe(false);
        const defaults = GenerateImageRequestQueryParamsSchema.parse({});
        expect(defaults.transparent).toBe(false);
        expect(defaults.audio).toBeUndefined();
    });

    it("rejects unrecognized boolean values", () => {
        for (const query of [{ transparent: "banana" }, { audio: "maybe" }]) {
            expect(() =>
                GenerateImageRequestQueryParamsSchema.parse(query),
            ).toThrow();
        }
    });
});

describe("GenerateTextRequestQueryParamsSchema numeric bounds", () => {
    it("accepts boundary values like the POST chat schema", () => {
        const parsed = GenerateTextRequestQueryParamsSchema.parse({
            temperature: "2",
            top_p: "1",
            presence_penalty: "-2",
            frequency_penalty: "2",
            repetition_penalty: "0",
            max_tokens: "0",
            seed: "2147483647",
            reasoning_effort: "high",
        });
        expect(parsed.temperature).toBe(2);
        expect(parsed.seed).toBe(2147483647);
        expect(parsed.reasoning_effort).toBe("high");
    });

    it.each([
        ["temperature", "2.5"],
        ["temperature", "-0.5"],
        ["top_p", "1.5"],
        ["presence_penalty", "3"],
        ["frequency_penalty", "-3"],
        ["repetition_penalty", "3"],
        ["repetition_penalty", "-1"],
        ["max_tokens", "-1"],
        ["max_completion_tokens", "-1"],
        ["seed", "2147483648"],
        ["reasoning_effort", "banana"],
    ])(
        "rejects out-of-range %s=%s like the POST chat schema",
        (field, value) => {
            expect(() =>
                GenerateTextRequestQueryParamsSchema.parse({
                    [field]: value,
                }),
            ).toThrow();
        },
    );
});

describe("GenerateImageRequestQueryParamsSchema duration", () => {
    it("accepts the documented 1-120s bound on GET like on POST", () => {
        const parsed = GenerateImageRequestQueryParamsSchema.parse({
            duration: "60",
        });
        expect(parsed.duration).toBe(60);
        expect(() =>
            GenerateImageRequestQueryParamsSchema.parse({
                duration: "121",
            }),
        ).toThrow();
        expect(() =>
            GenerateImageRequestQueryParamsSchema.parse({ duration: "0" }),
        ).toThrow();
    });
});
