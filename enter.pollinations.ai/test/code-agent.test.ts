import { afterEach, describe, expect, it, vi } from "vitest";
import {
    deleteCodeAgent,
    deployCodeAgent,
    loadCodeAgentSource,
    resolveCodeAgentRepository,
} from "../src/services/code-agent.ts";

const deploymentEnv = {
    ENVIRONMENT: "test",
    CLOUDFLARE_ACCOUNT_ID: "account-id",
    CODE_AGENT_DEPLOY_API_TOKEN: "deploy-token",
    CODE_AGENT_DISPATCH_NAMESPACE: "code-agents-test",
    GEN_BASE_URL: "https://gen.pollinations.ai",
};

afterEach(() => vi.unstubAllGlobals());

describe("code agent deployment", () => {
    it("uploads the platform wrapper and owner source", async () => {
        const fetchMock = vi.fn(async () => Response.json({ success: true }));
        vi.stubGlobal("fetch", fetchMock);

        const source =
            "export default async ({ request }) => new Response(request.url);";
        await deployCodeAgent(deploymentEnv, "agent-id", source);

        const [url, init] = fetchMock.mock.calls[0];
        expect(url).toContain(
            "/workers/dispatch/namespaces/code-agents-test/scripts/agent-id",
        );
        expect(init?.method).toBe("PUT");
        expect(init?.headers).toEqual({
            Authorization: "Bearer deploy-token",
        });
        const form = init?.body as FormData;
        const metadata = JSON.parse(
            await (form.get("metadata") as Blob).text(),
        );
        expect(metadata).toMatchObject({
            main_module: "index.mjs",
            bindings: [
                {
                    type: "plain_text",
                    name: "POLLINATIONS_BASE_URL",
                    text: "https://gen.pollinations.ai",
                },
            ],
        });
        expect(await (form.get("agent.mjs") as Blob).text()).toBe(source);
        const wrapper = await (form.get("index.mjs") as Blob).text();
        expect(wrapper).toContain('headers.delete("authorization")');
        expect(wrapper).toContain("return fetch(url, init)");
        expect(wrapper).toContain(
            'accept: "application/json, text/event-stream"',
        );
        expect(wrapper).toContain('line.startsWith("data:")');
        expect(wrapper).toContain('method: "tools/call"');
        expect(wrapper).toContain("request: safeRequest, pollinations, mcp");
    });

    it("loads agent.js from an immutable public GitHub revision", async () => {
        const source = "export default () => new Response('ok');";
        const commit = "a".repeat(40);
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith("/repos/example/agents")) {
                return Response.json({
                    name: "agents",
                    full_name: "example/agents",
                    description: "Example agents",
                    private: false,
                });
            }
            if (url.endsWith("/repos/example/agents/commits/HEAD")) {
                return Response.json({ sha: commit });
            }
            if (
                url ===
                `https://raw.githubusercontent.com/example/agents/${commit}/tools/image/agent.js`
            ) {
                return new Response(source);
            }
            return new Response(null, { status: 404 });
        });
        vi.stubGlobal("fetch", fetchMock);

        const repository = await resolveCodeAgentRepository(
            deploymentEnv,
            "https://github.com/example/agents",
        );
        expect(repository).toEqual({
            repository: "https://github.com/example/agents",
            name: "agents",
            description: "Example agents",
            deployedCommitSha: commit,
        });
        await expect(
            loadCodeAgentSource(
                repository.repository,
                "tools/image",
                repository.deployedCommitSha,
            ),
        ).resolves.toBe(source);
        expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
            Authorization: "token mock_github_auth_token",
        });
    });

    it("rejects a private GitHub repository", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async (input: RequestInfo | URL) =>
                String(input).endsWith("/commits/HEAD")
                    ? Response.json({ sha: "a".repeat(40) })
                    : Response.json({
                          name: "private-agent",
                          full_name: "example/private-agent",
                          description: null,
                          private: true,
                      }),
            ),
        );

        await expect(
            resolveCodeAgentRepository(
                deploymentEnv,
                "https://github.com/example/private-agent",
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("fails closed when deployment is not configured", async () => {
        await expect(
            deployCodeAgent(
                {
                    ...deploymentEnv,
                    CODE_AGENT_DEPLOY_API_TOKEN: undefined,
                },
                "agent-id",
                "export default () => new Response();",
            ),
        ).rejects.toMatchObject({ status: 503 });
    });

    it("treats an already absent Worker as deleted", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () => new Response(null, { status: 404 })),
        );
        await expect(
            deleteCodeAgent(deploymentEnv, "agent-id"),
        ).resolves.toBeUndefined();
    });
});
