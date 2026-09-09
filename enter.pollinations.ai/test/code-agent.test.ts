import { afterEach, describe, expect, it, vi } from "vitest";
import {
    deleteCodeAgent,
    deployCodeAgent,
} from "../src/services/code-agent.ts";

const deploymentEnv = {
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
