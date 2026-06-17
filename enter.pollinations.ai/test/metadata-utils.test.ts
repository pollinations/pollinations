import { describe, expect, test } from "vitest";
import { parseMetadata } from "../src/routes/metadata-utils.ts";

describe("parseMetadata", () => {
    test("parses normalized metadata objects", () => {
        expect(
            parseMetadata(
                JSON.stringify({
                    keyType: "publishable",
                    redirectUris: ["https://example.com/callback"],
                }),
            ),
        ).toEqual({
            keyType: "publishable",
            redirectUris: ["https://example.com/callback"],
        });
    });

    test("rejects invalid and non-object metadata", () => {
        expect(parseMetadata(null)).toEqual({});
        expect(parseMetadata("not json")).toEqual({});
        expect(parseMetadata(JSON.stringify(["not", "metadata"]))).toEqual({});
        expect(parseMetadata(JSON.stringify("double-encoded"))).toEqual({});
    });
});
