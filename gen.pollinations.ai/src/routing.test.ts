import { describe, expect, it } from "vitest";
import { classifyRoute, resolveRoute } from "./routing.ts";

function route(path: string) {
    return resolveRoute(new URL(path, "https://staging.gen.pollinations.ai"));
}

describe("resolveRoute", () => {
    it("classifies public API ownership explicitly", () => {
        expect(classifyRoute("/image/hello")).toBe("generation");
        expect(classifyRoute("/docs")).toBe("docs");
        expect(classifyRoute("/api/account/keys")).toBe("unsupported-api");
        expect(classifyRoute("/api/auth/session")).toBe("unsupported-api");
        expect(classifyRoute("/account/keys")).toBe("account-api");
    });

    it("redirects root to docs on the same origin", () => {
        expect(route("/")).toEqual({
            kind: "redirect",
            location: "https://staging.gen.pollinations.ai/docs",
            status: 301,
        });
    });

    it("routes docs locally without noindex", () => {
        const decision = route("/docs");

        expect(decision.kind).toBe("generation");
        if (decision.kind !== "generation") return;
        expect(decision.url.pathname).toBe("/docs");
    });

    it("normalizes trailing slashes before exact public route matching", () => {
        const docs = route("/docs/");
        const models = route("/models/");

        expect(docs.kind).toBe("generation");
        if (docs.kind !== "generation") return;
        expect(docs.url.pathname).toBe("/docs");

        expect(models.kind).toBe("generation");
        if (models.kind !== "generation") return;
        expect(models.url.pathname).toBe("/api/generate/text/models");
    });

    it("does not expose api paths on gen", () => {
        expect(route("/api").kind).toBe("notFound");

        const decision = route("/api/generate/v1/chat/completions");

        expect(decision.kind).toBe("notFound");
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

    it("proxies public account api subpaths to enter and rejects api aliases", () => {
        const account = route("/account/keys");
        const accountApi = route("/api/account/key/");
        const auth = route("/api/auth/session");

        expect(account.kind).toBe("enter");
        expect(accountApi.kind).toBe("notFound");
        expect(auth.kind).toBe("notFound");

        if (account.kind !== "enter") return;

        expect(account.url.pathname).toBe("/api/account/keys");
        expect(account.noIndex).toBe(true);
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
            "Disallow: /api/",
        );
    });
});
