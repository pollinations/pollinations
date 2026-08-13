import { describe, expect, it } from "vitest";
import { parsePositiveInt, requirePositiveInt } from "../src/lib/validate.js";

describe("parsePositiveInt", () => {
    it("accepts a valid positive integer", () => {
        expect(parsePositiveInt("1024", "--width")).toEqual({ value: 1024 });
    });

    it("rejects non-numeric input", () => {
        expect(parsePositiveInt("abc", "--width")).toEqual({
            error: '--width must be an integer, got "abc"',
        });
    });

    it("rejects floats", () => {
        expect(parsePositiveInt("12.5", "--height")).toEqual({
            error: '--height must be an integer, got "12.5"',
        });
    });

    it("rejects zero and negative", () => {
        expect(parsePositiveInt("0", "--width")).toEqual({
            error: '--width must be a positive integer, got "0"',
        });
        expect(parsePositiveInt("-5", "--width")).toEqual({
            error: '--width must be a positive integer, got "-5"',
        });
    });

    it("enforces min/max bounds", () => {
        expect(parsePositiveInt("10", "--width", { min: 16 })).toEqual({
            error: '--width must be at least 16, got "10"',
        });
        expect(parsePositiveInt("5000", "--width", { max: 4096 })).toEqual({
            error: '--width must be at most 4096, got "5000"',
        });
    });
});

describe("requirePositiveInt", () => {
    it("returns the value on success", () => {
        expect(requirePositiveInt("512", "--width")).toBe(512);
    });

    it("prints an error and exits 1 on failure", () => {
        const errors: string[] = [];
        const codes: number[] = [];
        const exitMock = (c: number): never => {
            codes.push(c);
            // A real process.exit never returns; simulate that by throwing
            throw new Error(`__exit__:${c}`);
        };
        expect(() =>
            requirePositiveInt(
                "abc",
                "--width",
                {},
                (m) => errors.push(m),
                exitMock,
            ),
        ).toThrow("__exit__:1");
        expect(codes).toEqual([1]);
        expect(errors).toEqual(['--width must be an integer, got "abc"']);
    });
});
