import { describe, expect, it } from "vitest";
import { classifyRoute, resolveRoute } from "./routing.ts";

function route(path: string) {
    return resolveRoute(new URL(path, "https://staging.gen.pollinations.ai"));
}

describe("resolveRoute", () => {
    it("classifies public API ownership explicitly", () => {
        expect(classifyRoute("/api/generate/text/hello")).toBe("generation");
        expect(classifyRoute("/image/hello")).toBe("generation");
        expect(classifyRoute("/api/docs")).toBe("docs");
        expect(classifyRoute("/api/account/keys")).toBe("control-plane-api");
        expect(classifyRoute("/api/auth/session")).toBe("control-plane-api");
        expect(classifyRoute("/account/keys")).toBe("account-ui");
    });

    it("redirects root and docs to api docs on the same origin", () => {
        expect(route("/")).toEqual({
            kind: "redirect",
            location: "https://staging.gen.pollinations.ai/api/docs",
            status: 301,
        });

        expect(route("/docs")).toEqual({
            kind: "redirect",
            location: "https://staging.gen.pollinations.ai/api/docs",
            status: 301,
        });
    });

    it("keeps docs on enter without noindex", () => {
        const decision = route("/api/docs");

        expect(decision.kind).toBe("enter");
        if (decision.kind !== "enter") return;
        expect(decision.url.pathname).toBe("/api/docs");
        expect(decision.noIndex).toBe(false);
    });

    it("routes api generation paths locally", () => {
        const decision = route("/api/generate/v1/chat/completions");

        expect(decision.kind).toBe("generation");
        if (decision.kind !== "generation") return;
        expect(decision.url.pathname).toBe("/api/generate/v1/chat/completions");
    });

    it("rewrites public shorthand paths to local generation routes", () => {
        const image = route("/image/a%20cat?model=flux");
        const text = route("/text/hello");
        const models = route("/models");

        expect(image.kind).toBe("generation");
        expect(text.kind).toBe("generation");
        expect(models.kind).toBe("generation");

        if (
            image.kind !== "generation" ||
            text.kind !== "generation" ||
            models.kind !== "generation"
        ) {
            return;
        }

        expect(image.url.pathname).toBe("/api/generate/image/a%20cat");
        expect(image.url.search).toBe("?model=flux");
        expect(text.url.pathname).toBe("/api/generate/text/hello");
        expect(models.url.pathname).toBe("/api/generate/text/models");
    });

    it("forwards the account app root to enter", () => {
        const account = route("/account");

        expect(account.kind).toBe("enter");
        if (account.kind !== "enter") return;

        expect(account.url.pathname).toBe("/account");
        expect(account.noIndex).toBe(true);
    });

    it("rewrites account api subpaths and forwards non-generation api routes to enter", () => {
        const account = route("/account/keys");
        const auth = route("/api/auth/session");

        expect(account.kind).toBe("enter");
        expect(auth.kind).toBe("enter");

        if (account.kind !== "enter" || auth.kind !== "enter") return;

        expect(account.url.pathname).toBe("/api/account/keys");
        expect(account.noIndex).toBe(true);
        expect(auth.url.pathname).toBe("/api/auth/session");
        expect(auth.noIndex).toBe(true);
    });

    it("preserves the previous broad fallback into api generation", () => {
        const decision = route("/custom/path?seed=1");

        expect(decision.kind).toBe("generation");
        if (decision.kind !== "generation") return;
        expect(decision.url.pathname).toBe("/api/generate/custom/path");
        expect(decision.url.search).toBe("?seed=1");
    });

    it("serves robots.txt locally", async () => {
        const decision = route("/robots.txt");

        expect(decision.kind).toBe("robots");
        if (decision.kind !== "robots") return;
        expect(decision.response.headers.get("Content-Type")).toBe(
            "text/plain",
        );
        await expect(decision.response.text()).resolves.toContain(
            "Disallow: /api/generate/",
        );
    });
});
