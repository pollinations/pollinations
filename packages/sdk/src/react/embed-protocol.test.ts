import { describe, expect, it } from "vitest";
import {
    EMBED_MESSAGE_SOURCE,
    isTrustedHostOrigin,
    parseHostMessage,
    TRUSTED_HOST_ORIGINS,
    validateHostMessage,
} from "./embed-protocol.js";

const PARENT = { id: "parent" }; // sentinel standing in for window.parent

describe("isTrustedHostOrigin", () => {
    it("accepts the built-in exact prod + staging origins", () => {
        expect(isTrustedHostOrigin("https://pollinations.ai")).toBe(true);
        expect(isTrustedHostOrigin("https://staging.pollinations.ai")).toBe(
            true,
        );
        expect(TRUSTED_HOST_ORIGINS).toContain("https://pollinations.ai");
    });

    it("rejects arbitrary origins", () => {
        expect(isTrustedHostOrigin("https://evil.com")).toBe(false);
        expect(isTrustedHostOrigin("https://pollinations.ai.evil.com")).toBe(
            false,
        );
    });

    it("rejects *.pollinations.ai subdomains (exact match only)", () => {
        expect(isTrustedHostOrigin("https://foo.pollinations.ai")).toBe(false);
        expect(isTrustedHostOrigin("http://pollinations.ai")).toBe(false); // wrong scheme
    });

    it("allows loopback only when allowLoopback is set", () => {
        expect(isTrustedHostOrigin("http://localhost:4178")).toBe(false);
        expect(
            isTrustedHostOrigin("http://localhost:4178", {
                allowLoopback: true,
            }),
        ).toBe(true);
        expect(
            isTrustedHostOrigin("http://127.0.0.1:5173", {
                allowLoopback: true,
            }),
        ).toBe(true);
        expect(
            isTrustedHostOrigin("https://localhost", { allowLoopback: true }),
        ).toBe(false);
    });

    it("honours an explicit trustedOrigins override", () => {
        expect(
            isTrustedHostOrigin("https://x.test", {
                trustedOrigins: ["https://x.test"],
            }),
        ).toBe(true);
    });
});

describe("parseHostMessage", () => {
    it("parses host-hello with capabilities", () => {
        expect(
            parseHostMessage({
                source: EMBED_MESSAGE_SOURCE,
                type: "host-hello",
                capabilities: { authControl: true },
            }),
        ).toEqual({
            source: EMBED_MESSAGE_SOURCE,
            type: "host-hello",
            capabilities: { authControl: true },
        });
    });

    it("parses auth with a string apiKey (the borrowed key)", () => {
        expect(
            parseHostMessage({
                source: EMBED_MESSAGE_SOURCE,
                type: "auth",
                apiKey: "sk_borrowed",
            }),
        ).toEqual({
            source: EMBED_MESSAGE_SOURCE,
            type: "auth",
            apiKey: "sk_borrowed",
        });
    });

    it("parses auth with a null apiKey (logout / signed out)", () => {
        expect(
            parseHostMessage({
                source: EMBED_MESSAGE_SOURCE,
                type: "auth",
                apiKey: null,
            }),
        ).toEqual({ source: EMBED_MESSAGE_SOURCE, type: "auth", apiKey: null });
    });

    it("rejects foreign / malformed messages", () => {
        expect(parseHostMessage(null)).toBeNull();
        expect(parseHostMessage("nope")).toBeNull();
        expect(
            parseHostMessage({ source: "other", type: "host-hello" }),
        ).toBeNull();
        expect(
            parseHostMessage({ source: EMBED_MESSAGE_SOURCE, type: "unknown" }),
        ).toBeNull();
        expect(
            parseHostMessage({
                source: EMBED_MESSAGE_SOURCE,
                type: "host-hello",
            }),
        ).toBeNull(); // no caps
        expect(
            parseHostMessage({
                source: EMBED_MESSAGE_SOURCE,
                type: "auth",
                apiKey: 123,
            }),
        ).toBeNull(); // bad key type
        expect(
            parseHostMessage({ source: EMBED_MESSAGE_SOURCE, type: "auth" }),
        ).toBeNull(); // missing key
    });
});

describe("validateHostMessage", () => {
    const ctx = { parentWindow: PARENT, allowLoopback: false };
    const authMsg = {
        source: EMBED_MESSAGE_SOURCE,
        type: "auth",
        apiKey: "sk_x",
    };

    it("accepts a valid message from a trusted origin + the real parent", () => {
        expect(
            validateHostMessage(
                {
                    origin: "https://pollinations.ai",
                    source: PARENT,
                    data: authMsg,
                },
                ctx,
            ),
        ).toEqual(authMsg);
    });

    it("rejects an untrusted origin even from the parent", () => {
        expect(
            validateHostMessage(
                { origin: "https://evil.com", source: PARENT, data: authMsg },
                ctx,
            ),
        ).toBeNull();
    });

    it("rejects a trusted origin when source is not the parent", () => {
        expect(
            validateHostMessage(
                {
                    origin: "https://pollinations.ai",
                    source: { id: "other" },
                    data: authMsg,
                },
                ctx,
            ),
        ).toBeNull();
    });
});
