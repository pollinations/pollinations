import { describe, expect, it } from "vitest";
import {
    createLocalProvider,
    parseOutcome,
    validateProviderRequest,
} from "../local-provider";

const authorization = () => {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.search = new URLSearchParams({
        client_id: "test_github_client_id",
        redirect_uri: "http://localhost:4180/api/auth/callback/github",
        state: "test-state-not-a-credential",
        code_challenge: "A".repeat(43),
        code_challenge_method: "S256",
    }).toString();
    return url;
};

describe("local provider boundary", () => {
    it("accepts only Enter's local GitHub request and retains state and PKCE", () => {
        expect(validateProviderRequest(authorization().href)).toEqual({
            state: "test-state-not-a-credential",
            challenge: "A".repeat(43),
        });
    });
    it.each([
        ["client_id", "another-client"],
        [
            "redirect_uri",
            "https://enter.pollinations.ai/api/auth/callback/github",
        ],
        ["redirect_uri", "http://localhost:4180/other-callback"],
        ["state", ""],
        ["code_challenge_method", "plain"],
    ])("rejects a mismatched %s", (key, value) => {
        const url = authorization();
        url.searchParams.set(key, value);
        expect(() => validateProviderRequest(url.href)).toThrow();
    });
    it("does not accept another external provider", () => {
        const url = authorization();
        url.hostname = "example.com";
        expect(() => validateProviderRequest(url.href)).toThrow();
    });
    it.each([
        "normal",
        "fail-start",
        "fail-next",
        "slow",
    ])("accepts the %s outcome", (signIn) => {
        expect(parseOutcome({ signIn })).toBe(signIn);
    });
    it.each([
        null,
        [],
        {},
        { signIn: "unknown" },
        { signIn: "normal", account: "other" },
    ])("rejects an invalid outcome %j", (value) => {
        expect(() => parseOutcome(value)).toThrow();
    });
    it("consumes a sign-in start failure once so a real retry can proceed", () => {
        const provider = createLocalProvider();
        provider.setOutcome({ signIn: "fail-start" });
        expect(provider.takeStartFailure()).toBe(true);
        expect(provider.outcome()).toEqual({ signIn: "normal" });
        expect(provider.takeStartFailure()).toBe(false);
    });
    it.each([
        "normal",
        "slow",
        "fail-next",
    ])("leaves %s unchanged when checking for a sign-in start failure", (signIn) => {
        const provider = createLocalProvider();
        provider.setOutcome({ signIn });
        expect(provider.takeStartFailure()).toBe(false);
        expect(provider.outcome()).toEqual({ signIn });
    });
    it("does not consume a pending failure on invalid token requests", async () => {
        const provider = createLocalProvider();
        provider.setOutcome({ signIn: "fail-next" });
        const response = await provider.outbound(
            new Request("https://github.com/login/oauth/access_token", {
                method: "POST",
                body: new URLSearchParams({ code: "nonexistent-code" }),
            }),
        );
        expect(response.status).toBe(400);
        expect(provider.outcome()).toEqual({ signIn: "fail-next" });
    });
    it("never forwards an unrelated external request", async () => {
        const response = await createLocalProvider().outbound(
            new Request("https://api.stripe.com/v1/balance"),
        );
        expect(response.status).toBe(503);
    });
});
