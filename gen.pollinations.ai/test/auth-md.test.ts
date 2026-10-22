import {
    createExecutionContext,
    waitOnExecutionContext,
} from "cloudflare:test";
import { describe, expect, it } from "vitest";
import worker from "../src/index.ts";

// The origin follows the serving host, so staging points at staging enter.
const ORIGIN = "https://staging.gen.pollinations.ai";
const ENTER = "https://staging.enter.pollinations.ai";

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
    it("serves the sign-in guide as Markdown on the serving host", async () => {
        const res = await fetchWorker("/auth.md");
        expect(res.status).toBe(200);
        expect(res.headers.get("content-type")).toContain("text/markdown");

        const body = await res.text();
        const gen = body.includes(ORIGIN);
        // Every endpoint the document tells an agent to call has to be the one for
        // this host, or staging would send agents to production.
        expect(gen).toBe(true);
        expect(body).toContain(`${ENTER}/api/device/code`);
        expect(body).toContain(`${ENTER}/api/oauth/token`);
        expect(body).toContain(
            `${ORIGIN}/.well-known/oauth-protected-resource`,
        );
    });

    it("documents every scope the API understands", async () => {
        const body = await (await fetchWorker("/auth.md")).text();
        for (const scope of [
            "generate",
            "profile",
            "usage",
            "keys",
            "machines",
        ]) {
            expect(body).toContain(`\`${scope}\``);
        }
    });

    it("is linked from llms.txt", async () => {
        const llms = await (await fetchWorker("/llms.txt")).text();
        expect(llms).toContain("/auth.md");
    });
});
