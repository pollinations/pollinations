import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

// The origin follows the serving host, so staging points at staging enter.
const ORIGIN = "https://staging.gen.pollinations.ai";

async function fetchWorker(path: string) {
    const ctx = createExecutionContext();
    const response = await worker.fetch(
        new Request(`${ORIGIN}${path}`),
        { ENVIRONMENT: "test" } as CloudflareBindings,
        ctx,
    );
    await waitOnExecutionContext(ctx);
    return response;
}

describe("auth.md", () => {
    it("answers markdown with the credential paths that exist", async () => {
        const res = await fetchWorker("/auth.md");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe(
            "text/markdown; charset=utf-8",
        );
        const md = await res.text();
        expect(md).toContain("# Pollinations authentication");
        // The two key sources an agent can act on without a dashboard.
        expect(md).toContain(
            "https://staging.enter.pollinations.ai/api/x402/keys/0.50",
        );
        expect(md).toContain("auth login");
        // Scopes and the failure table stay in sync with the metadata route.
        for (const scope of [
            "generate",
            "profile",
            "usage",
            "keys",
            "machines",
        ]) {
            expect(md).toContain(`\`${scope}\``);
        }
        expect(md).toContain("paid_only");
        expect(md).toContain("/.well-known/oauth-protected-resource");
        // No agent registration: the file must say so rather than imply it.
        expect(md).toContain("Not supported");
    });

    it("calls the first endpoint with the published origin", async () => {
        const md = await (await fetchWorker("/auth.md")).text();
        expect(md).toContain(`${ORIGIN}/v1/chat/completions`);
        expect(md).toContain(`${ORIGIN}/v1/models`);
    });

    it("is linked from llms.txt", async () => {
        const llms = await (await fetchWorker("/llms.txt")).text();
        expect(llms).toContain(`${ORIGIN}/auth.md`);
    });
});
