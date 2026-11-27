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
    it("serves markdown with the credential paths and status codes", async () => {
        const res = await fetchWorker("/auth.md");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toBe(
            "text/markdown; charset=utf-8",
        );
        const md = await res.text();
        // Every path an agent can act on, including the one with no account.
        for (const fact of [
            "auth login",
            "/api/x402/keys/",
            "paid_only",
            "`profile`",
            "`machines`",
            "`401`",
            "`402`",
            "`403`",
            "`429`",
            "/.well-known/oauth-protected-resource",
        ]) {
            expect(md).toContain(fact);
        }
        // No agent registration: the file must say so, not imply it.
        expect(md).toContain("Agent-initiated registration");
    });

    it("uses the serving origin everywhere and is linked from llms.txt", async () => {
        const md = await (await fetchWorker("/auth.md")).text();
        expect(md).toContain(`${ORIGIN}/v1/chat/completions`);
        expect(md).toContain(`${ORIGIN}/v1/models`);
        expect(md).not.toContain("https://gen.pollinations.ai");

        const llms = await (await fetchWorker("/llms.txt")).text();
        expect(llms).toContain(`${ORIGIN}/auth.md`);
    });
});
