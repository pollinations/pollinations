import { describe, expect, it } from "vitest";
import { generatePortkeyHeaders } from "@/text/portkeyUtils.ts";

describe("generatePortkeyHeaders", () => {
    it("flattens a provider config into x-portkey-* headers", async () => {
        const headers = await generatePortkeyHeaders({
            provider: "openai",
            "custom-host": "https://api.example.com/v1",
            authKey: "test-key",
            model: "provider-model",
        });

        expect(headers["x-portkey-provider"]).toBe("openai");
        expect(headers["x-portkey-custom-host"]).toBe(
            "https://api.example.com/v1",
        );
        expect(headers["x-portkey-model"]).toBe("provider-model");
        expect(headers.Authorization).toBe("Bearer test-key");
    });
});
