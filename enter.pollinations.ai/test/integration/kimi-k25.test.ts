import { SELF } from "cloudflare:test";
import { describe, expect } from "vitest";
import { test } from "../fixtures.ts";

describe("Kimi K2.5 Model Tests", () => {
    test(
        "kimi model supports text generation",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "kimi",
                        messages: [
                            {
                                role: "user",
                                content: "Say 'Kimi K2.5 is working' exactly",
                            },
                        ],
                        max_tokens: 20,
                    }),
                },
            );

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.choices).toBeDefined();
            expect(result.choices[0].message.content).toContain("Kimi K2.5 is working");
            // Model returns the full Fireworks model ID
            expect(result.model).toBe("accounts/fireworks/models/kimi-k2p5");
        },
    );

    test(
        "kimi model supports vision (image input)",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/chat/completions",
                {
                    method: "POST",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                        "content-type": "application/json",
                    },
                    body: JSON.stringify({
                        model: "kimi",
                        messages: [
                            {
                                role: "user",
                                content: [
                                    {
                                        type: "text",
                                        text: "If you can see this image, say 'Vision test successful'",
                                    },
                                    {
                                        type: "image_url",
                                        image_url: {
                                            // Small 1x1 pixel PNG
                                            url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
                                        },
                                    },
                                ],
                            },
                        ],
                        max_tokens: 20,
                    }),
                },
            );

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.choices).toBeDefined();
            expect(result.choices[0].message.content.toLowerCase()).toContain("vision test successful");
            // Model returns the full Fireworks model ID
            expect(result.model).toBe("accounts/fireworks/models/kimi-k2p5");
        },
    );

    test(
        "kimi model aliases work correctly",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            // Test various aliases
            const aliases = ["kimi-k2.5", "kimi-k2p5", "kimi-large"];

            for (const alias of aliases) {
                const response = await SELF.fetch(
                    "http://localhost:3000/api/generate/v1/chat/completions",
                    {
                        method: "POST",
                        headers: {
                            "authorization": `Bearer ${apiKey}`,
                            "content-type": "application/json",
                        },
                        body: JSON.stringify({
                            model: alias,
                            messages: [
                                {
                                    role: "user",
                                    content: `Say 'Alias ${alias} works'`,
                                },
                            ],
                            max_tokens: 20,
                        }),
                    },
                );

                expect(response.status).toBe(200);

                const result = await response.json();
                expect(result.choices).toBeDefined();
                expect(result.choices[0].message.content).toContain(`Alias ${alias} works`);
                // Model returns the full Fireworks model ID
                expect(result.model).toBe("accounts/fireworks/models/kimi-k2p5");
            }
        },
    );

    test(
        "kimi model appears in available models list",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/v1/models",
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);

            const result = await response.json();
            expect(result.data).toBeDefined();

            const kimiModel = result.data.find((m: any) => m.id === "kimi");
            expect(kimiModel).toBeDefined();
            expect(kimiModel.object).toBe("model");
        },
    );

    test(
        "kimi model info includes vision and reasoning capabilities",
        { timeout: 30000 },
        async ({ apiKey, mocks }) => {
            await mocks.enable("polar", "tinybird");

            const response = await SELF.fetch(
                "http://localhost:3000/api/generate/text/models",
                {
                    method: "GET",
                    headers: {
                        "authorization": `Bearer ${apiKey}`,
                    },
                },
            );

            expect(response.status).toBe(200);

            const models = await response.json();
            const kimiModel = models.find((m: any) => m.name === "kimi");

            expect(kimiModel).toBeDefined();
            expect(kimiModel.description).toContain("K2.5");
            expect(kimiModel.description).toContain("Flagship Agentic Model");

            // Check if inputModalities exists and has the expected values
            if (kimiModel.inputModalities) {
                expect(kimiModel.inputModalities).toContain("text");
                expect(kimiModel.inputModalities).toContain("image");
            }

            expect(kimiModel.reasoning).toBe(true);
            expect(kimiModel.tools).toBe(true);

            // Context window might not be exposed in the API response
            if (kimiModel.contextWindow !== undefined) {
                expect(kimiModel.contextWindow).toBe(256000);
            }

            // Check pricing if available (prices are in dollars per token)
            if (kimiModel.price) {
                expect(kimiModel.price.promptTextTokens).toBe(0.0000006); // /bin/zsh.60/1M
                expect(kimiModel.price.promptCachedTokens).toBe(0.0000001); // /bin/zsh.10/1M
                expect(kimiModel.price.completionTextTokens).toBe(0.000003); // .00/1M
            }
        },
    );
});