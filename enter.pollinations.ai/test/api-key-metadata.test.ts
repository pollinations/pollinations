import {
    getRedirectUris,
    parseMetadata,
} from "@shared/auth/api-key-metadata.ts";
import { describe, expect, test } from "vitest";

describe("API key metadata", () => {
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

    test("keeps only non-empty string redirect URIs", () => {
        expect(
            getRedirectUris({
                redirectUris: ["https://example.com/callback", "", null, 1],
            }),
        ).toEqual(["https://example.com/callback"]);
        expect(getRedirectUris({ redirectUris: "not-an-array" })).toEqual([]);
    });
});
