import { afterEach, describe, expect, it, vi } from "vitest";
import { resolveOAuthClient } from "../src/services/oauth-client.ts";

const CLIENT_ID = "https://client.example/oauth-client.json";

const unusedAuth = {
    api: {
        verifyApiKey: vi.fn(async () => ({ valid: false })),
    },
};

afterEach(() => {
    vi.unstubAllGlobals();
});

describe("OAuth client resolution", () => {
    it("resolves a valid client ID metadata document", async () => {
        const fetchMock = vi.fn(async () =>
            Response.json({
                client_id: CLIENT_ID,
                client_name: "Example MCP Client",
                redirect_uris: ["https://app.example/cb"],
                token_endpoint_auth_method: "none",
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            resolveOAuthClient({
                db: {} as D1Database,
                auth: unusedAuth,
                clientId: CLIENT_ID,
            }),
        ).resolves.toEqual({
            clientId: CLIENT_ID,
            appName: "Example MCP Client",
            redirectUris: ["https://app.example/cb"],
            earningsEnabled: false,
            registeredApp: false,
        });

        expect(fetchMock).toHaveBeenCalledWith(
            CLIENT_ID,
            expect.objectContaining({
                redirect: "error",
                headers: { Accept: "application/json" },
            }),
        );
    });

    it("rejects special-use hosts without fetching them", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        await expect(
            resolveOAuthClient({
                db: {} as D1Database,
                auth: unusedAuth,
                clientId: "https://localhost/oauth-client.json",
            }),
        ).resolves.toBeNull();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("rejects metadata documents larger than 5 KB", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(async () =>
                Response.json({
                    client_id: CLIENT_ID,
                    redirect_uris: ["https://app.example/cb"],
                    padding: "x".repeat(5 * 1024),
                }),
            ),
        );

        await expect(
            resolveOAuthClient({
                db: {} as D1Database,
                auth: unusedAuth,
                clientId: CLIENT_ID,
            }),
        ).resolves.toBeNull();
    });
});
