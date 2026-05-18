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
                model: "deepseek/deepseek-v4-flash",
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

    it("allows image input for vision-capable models", () => {
        expect(
            validateInputModalities(imageMessage, {
                model: "mistralai/mistral-small-3.2-24b-instruct",
                requestedModel: "mistral",
            }).messages,
        ).toBe(imageMessage);
    });

    it("allows text-only requests for text-only models", () => {
        const textMessage: ChatMessage[] = [{ role: "user", content: "Hello" }];

        expect(
            validateInputModalities(textMessage, {
                model: "deepseek/deepseek-v4-flash",
                requestedModel: "deepseek",
            }).messages,
        ).toBe(textMessage);
    });
});
