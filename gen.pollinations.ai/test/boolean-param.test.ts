import { describe, expect, it } from "vitest";
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
