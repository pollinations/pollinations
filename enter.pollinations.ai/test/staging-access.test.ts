import { describe, expect, it } from "vitest";
import { parseGithubIdList } from "@/auth.ts";

describe("parseGithubIdList", () => {
    it("parses a comma-separated list of numeric IDs", () => {
        const ids = parseGithubIdList("36901823,5099901");
        expect(ids.has(36901823)).toBe(true);
        expect(ids.has(5099901)).toBe(true);
        expect(ids.size).toBe(2);
    });

    it("trims whitespace around entries", () => {
        const ids = parseGithubIdList("  36901823 ,   5099901  ");
        expect(ids.has(36901823)).toBe(true);
        expect(ids.has(5099901)).toBe(true);
    });

    it("drops non-numeric and non-positive entries", () => {
        const ids = parseGithubIdList("36901823,abc,,-1,0,5099901");
        expect(Array.from(ids).sort((a, b) => a - b)).toEqual([
            5099901, 36901823,
        ]);
    });

    it("returns an empty set for empty / null / undefined", () => {
        expect(parseGithubIdList("").size).toBe(0);
        expect(parseGithubIdList(null).size).toBe(0);
        expect(parseGithubIdList(undefined).size).toBe(0);
    });
});
