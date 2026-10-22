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

describe("RFC 9728 protected resource metadata", () => {
    it("names the enter authorization server and is linked from llms.txt", async () => {
        const res = await fetchWorker("/.well-known/oauth-protected-resource");
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({
            resource: ORIGIN,
            authorization_servers: ["https://staging.enter.pollinations.ai"],
            scopes_supported: [
                "generate",
                "profile",
                "usage",
                "keys",
                "machines",
            ],
            bearer_methods_supported: ["header"],
            resource_name: "Pollinations API",
            resource_documentation: `${ORIGIN}/docs/llm.txt`,
        });

        const llms = await (await fetchWorker("/llms.txt")).text();
        expect(llms).toContain("/.well-known/oauth-protected-resource");
    });
});
