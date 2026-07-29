import { describe, expect, it } from "vitest";
import { generatePortkeyHeaders } from "@/text/portkeyUtils.ts";

describe("generatePortkeyHeaders — fallback config", () => {
    it("emits a single x-portkey-config blob with per-target api_key resolved", async () => {
        const config = {
            model: "gemini-3-flash-preview",
            strategy: {
                mode: "fallback",
                on_status_codes: [400, 402, 429, 500],
            },
            targets: [
                {
                    provider: "openai",
                    custom_host: "https://api.airforce/v1",
                    authKey: "sk-air-test",
                    override_params: { model: "gemini-3-flash" },
                },
                {
                    provider: "vertex-ai",
                    authKey: async () => "vertex-token",
                    vertex_project_id: "proj",
                    vertex_region: "global",
                    override_params: { model: "gemini-3-flash-preview" },
                },
            ],
        };

        const headers = await generatePortkeyHeaders(config);

        // Fallback configs emit the config blob plus the request-wide
        // strict-compliance header (needed for Gemini thinking/thought_signature).
        expect(new Set(Object.keys(headers))).toEqual(
            new Set([
                "x-portkey-config",
                "x-portkey-strict-open-ai-compliance",
            ]),
        );
        expect(headers["x-portkey-strict-open-ai-compliance"]).toBe("false");

        const payload = JSON.parse(headers["x-portkey-config"]);
        expect(payload.strategy).toEqual(config.strategy);
        expect(payload.targets).toHaveLength(2);

        // authKey is resolved into api_key and the raw authKey is dropped.
        expect(payload.targets[0]).toMatchObject({
            provider: "openai",
            custom_host: "https://api.airforce/v1",
            api_key: "sk-air-test",
            override_params: { model: "gemini-3-flash" },
        });
        expect(payload.targets[0].authKey).toBeUndefined();

        // Function authKey (e.g. minted Vertex token) is awaited.
        expect(payload.targets[1]).toMatchObject({
            provider: "vertex-ai",
            api_key: "vertex-token",
            vertex_project_id: "proj",
        });
        expect(payload.targets[1].authKey).toBeUndefined();
    });

    it("still flattens a normal single-provider config into x-portkey-* headers", async () => {
        const headers = await generatePortkeyHeaders({
            provider: "openai",
            "custom-host": "https://api.airforce/v1",
            authKey: "sk-air-test",
            model: "gemini-3-flash",
        });

        expect(headers["x-portkey-provider"]).toBe("openai");
        expect(headers["x-portkey-custom-host"]).toBe(
            "https://api.airforce/v1",
        );
        expect(headers["x-portkey-model"]).toBe("gemini-3-flash");
        expect(headers["Authorization"]).toBe("Bearer sk-air-test");
        expect(headers["x-portkey-config"]).toBeUndefined();
    });
});

describe("generatePortkeyHeaders — delegated agent run token", () => {
    it("forwards the run token verbatim, alongside the endpoint credential", async () => {
        const headers = await generatePortkeyHeaders({
            provider: "openai",
            "custom-host": "https://agent.example.com/v1",
            authKey: "sk_endpoint_access_token",
            model: "agent",
            agentRunToken: "ag_delegated.token",
        });

        // Two credentials, two headers: Authorization is the endpoint's own
        // access token, X-Pollinations-Key is what it may spend.
        expect(headers["Authorization"]).toBe(
            "Bearer sk_endpoint_access_token",
        );
        expect(headers["X-Pollinations-Key"]).toBe("ag_delegated.token");
        // Portkey drops unknown headers unless they are named here.
        expect(headers["x-portkey-forward-headers"]).toBe("X-Pollinations-Key");
        // The token must not leak into the flattened x-portkey-* config.
        expect(headers["x-portkey-agentRunToken"]).toBeUndefined();
    });

    it("omits the header entirely when nothing is delegated", async () => {
        const headers = await generatePortkeyHeaders({
            provider: "openai",
            authKey: "sk_endpoint_access_token",
            model: "agent",
        });

        expect(headers["X-Pollinations-Key"]).toBeUndefined();
        expect(headers["x-portkey-forward-headers"]).toBeUndefined();
    });
});
