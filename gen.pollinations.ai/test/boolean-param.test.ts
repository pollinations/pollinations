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

describe("GenerateTextRequestQueryParamsSchema numeric params", () => {
    it("rejects invalid float params instead of silently ignoring them", () => {
        for (const param of [
            "top_p",
            "presence_penalty",
            "frequency_penalty",
            "repetition_penalty",
        ]) {
            expect(() =>
                GenerateTextRequestQueryParamsSchema.parse({
                    [param]: "banana",
                }),
            ).toThrow();
        }
    });

    it("rejects invalid int params instead of silently ignoring them", () => {
        for (const param of ["max_tokens", "max_completion_tokens"]) {
            expect(() =>
                GenerateTextRequestQueryParamsSchema.parse({
                    [param]: "banana",
                }),
            ).toThrow();
        }
    });

    it("accepts valid numeric params", () => {
        const parsed = GenerateTextRequestQueryParamsSchema.parse({
            top_p: "0.5",
            presence_penalty: "-0.5",
            frequency_penalty: "1",
            repetition_penalty: "0.25",
            max_tokens: "100",
            max_completion_tokens: "200",
        });
        expect(parsed.top_p).toBe(0.5);
        expect(parsed.presence_penalty).toBe(-0.5);
        expect(parsed.frequency_penalty).toBe(1);
        expect(parsed.repetition_penalty).toBe(0.25);
        expect(parsed.max_tokens).toBe(100);
        expect(parsed.max_completion_tokens).toBe(200);
    });

    it("treats an empty string as not provided", () => {
        const parsed = GenerateTextRequestQueryParamsSchema.parse({
            top_p: "",
            max_tokens: "",
        });
        expect(parsed.top_p).toBeUndefined();
        expect(parsed.max_tokens).toBeUndefined();
    });
});
