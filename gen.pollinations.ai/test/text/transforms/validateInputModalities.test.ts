import { describe, expect, it } from "vitest";
import { validateInputModalities } from "../../../src/text/transforms/validateInputModalities.js";
import type { ChatMessage } from "../../../src/text/types.js";

const imageMessage: ChatMessage[] = [
    {
        role: "user",
        content: [
            { type: "text", text: "What is in this image?" },
            {
                type: "image_url",
                image_url: { url: "https://example.com/image.png" },
            },
        ],
    },
];

describe("validateInputModalities", () => {
    it("rejects image input for text-only models", () => {
        expect(() =>
            validateInputModalities(imageMessage, {
                model: "accounts/fireworks/models/deepseek-v4-flash",
                requestedModel: "deepseek",
            }),
        ).toThrow(
            expect.objectContaining({
                name: "InputModalityError",
                status: 400,
                message:
                    "Model 'deepseek' does not support image input. Choose a model with image input support.",
            }),
        );
    });

    // requestedModel must stay a real registry name/alias so resolveModelName
    // succeeds (the provider model id is not a registry key).
    it.each([
        { model: "grok-4.3", requestedModel: "grok-4.3" },
        {
            model: "mistralai/mistral-small-3.2-24b-instruct",
            requestedModel: "mistral",
        },
    ])("allows image input for vision-capable model $model", ({
        model,
        requestedModel,
    }) => {
        expect(
            validateInputModalities(imageMessage, { model, requestedModel })
                .messages,
        ).toBe(imageMessage);
    });

    it("allows text-only requests for text-only models", () => {
        const textMessage: ChatMessage[] = [{ role: "user", content: "Hello" }];

        expect(
            validateInputModalities(textMessage, {
                model: "accounts/fireworks/models/deepseek-v4-flash",
                requestedModel: "deepseek",
            }).messages,
        ).toBe(textMessage);
    });

    it("rejects image input for dynamic text-only model definitions", () => {
        expect(() =>
            validateInputModalities(imageMessage, {
                model: "community/owner/model",
                requestedModel: "community/owner/model",
                modelDef: { inputModalities: ["text"] },
            }),
        ).toThrow(
            expect.objectContaining({
                name: "InputModalityError",
                status: 400,
                message:
                    "Model 'community/owner/model' does not support image input. Choose a model with image input support.",
            }),
        );
    });
});
