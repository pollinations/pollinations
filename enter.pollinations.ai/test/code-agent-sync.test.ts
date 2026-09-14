import { env } from "cloudflare:test";
import { runtimeModule, sdkModules } from "virtual:code-agent-sdk";
import { CODE_AGENT_BASE_URL_PLACEHOLDER } from "@shared/community-endpoints.ts";
import { communityEndpoint } from "@shared/db/better-auth.ts";
import { createTestUser } from "@shared/test/fixtures/index.ts";
import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";
import { publicAgentSyncRoutes } from "../src/routes/agents.ts";

afterEach(() => vi.unstubAllGlobals());

describe("code agent sync", () => {
    it.each([
        "Same description",
        "Updated description",
    ])("refreshes the platform runtime at the same owner commit (%s)", async (description) => {
        const id = crypto.randomUUID();
        const commit = "a".repeat(40);
        const repository = "https://github.com/example/agent";
        await drizzle(env.DB)
            .insert(communityEndpoint)
            .values({
                id,
                ownerUserId: await createTestUser(),
                name: "agent",
                title: "agent",
                description: "Same description",
                type: "code_agent",
                baseUrl: CODE_AGENT_BASE_URL_PLACEHOLDER,
                upstreamModel: id,
                payload: JSON.stringify({
                    repository,
                    deployedCommitSha: commit,
                }),
            });

        const calls: string[] = [];
        let uploaded: FormData | undefined;
        vi.stubGlobal("fetch", async (input, init) => {
            const url = String(input);
            calls.push(url);
            if (url === "https://api.github.com/repos/example/agent") {
                return Response.json({
                    name: "agent",
                    full_name: "example/agent",
                    description,
                    private: false,
                });
            }
            if (url.endsWith("/commits/HEAD")) {
                return Response.json({ sha: commit });
            }
            if (url.startsWith("https://raw.githubusercontent.com/")) {
                expect(url).toBe(
                    `https://raw.githubusercontent.com/example/agent/${commit}/agent.ts`,
                );
                return new Response(
                    "export default () => new Response('agent');",
                );
            }
            expect(url).toContain(`/scripts/${id}`);
            expect(init.method).toBe("PUT");
            uploaded = init.body;
            return Response.json({ success: true });
        });

        const bindings = {
            ...env,
            ENVIRONMENT: "test",
            CLOUDFLARE_ACCOUNT_ID: "test-account",
            CODE_AGENT_DEPLOY_API_TOKEN: "test-deploy-token",
            CODE_AGENT_DISPATCH_NAMESPACE: "test-code-agents",
        };
        const response = await publicAgentSyncRoutes.request(
            `/${id}/sync`,
            { method: "POST" },
            bindings,
        );
        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            updated: true,
            deployedCommitSha: commit,
        });
        expect(calls).toHaveLength(4);
        expect(await (uploaded?.get("runtime.mjs") as Blob).text()).toBe(
            runtimeModule,
        );
        for (const [name, source] of Object.entries(sdkModules)) {
            expect(await (uploaded?.get(name) as Blob).text()).toBe(source);
        }

        const throttled = await publicAgentSyncRoutes.request(
            `/${id}/sync`,
            { method: "POST" },
            bindings,
        );
        expect(throttled.status).toBe(429);
        expect(calls).toHaveLength(4);
    });
});
