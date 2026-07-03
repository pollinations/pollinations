import { describe, expect, it } from "vitest";
import { buildNdjson } from "./write";

describe("buildNdjson", () => {
    it("serializes rows as newline-delimited JSON", () => {
        expect(buildNdjson([{ a: 1 }, { b: "two" }])).toBe(
            '{"a":1}\n{"b":"two"}\n',
        );
    });
});
