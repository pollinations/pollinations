import { describe, expect, it } from "vitest";
import { endpointAgentBody, modelBody } from "./my-models.js";

describe("modelBody", () => {
    it("builds image model registration fields supported by the API", () => {
        expect(
            modelBody(
                {
                    name: "image-provider",
                    title: "Image Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "image",
                    imagePricing: "request",
                    inputModalities: "text,image",
                    fallbacks: "owner/backup, owner/secondary",
                    completionImagePrice: "0.01",
                },
                true,
            ),
        ).toEqual({
            name: "image-provider",
            title: "Image Provider",
            baseUrl: "https://example.com/v1",
            bearerToken: "upstream-token",
            modality: "image",
            imagePricing: "request",
            inputModalities: ["text", "image"],
            fallbacks: ["owner/backup", "owner/secondary"],
            completionImagePrice: 0.01,
        });
    });

    it("sends the paid-only choice only when the flag is given", () => {
        expect(modelBody({ visibility: "public" }, false)).toEqual({
            visibility: "public",
        });
        expect(modelBody({ paidOnly: true }, false)).toEqual({
            paidOnly: true,
        });
        expect(modelBody({ paidOnly: false }, false)).toEqual({
            paidOnly: false,
        });
    });

    it("keeps modality out of updates while allowing image pricing changes", () => {
        expect(
            modelBody(
                {
                    imagePricing: "tokens",
                    promptImagePrice: "0.000001",
                    completionImagePrice: "0.02",
                    modality: "image",
                },
                false,
            ),
        ).toEqual({
            imagePricing: "tokens",
            promptImagePrice: 0.000001,
            completionImagePrice: 0.02,
        });
    });

    it("supports transcription model registration", () => {
        expect(
            modelBody(
                {
                    name: "speech-provider",
                    title: "Speech Provider",
                    baseUrl: "https://example.com/v1",
                    bearerToken: "upstream-token",
                    modality: "transcription",
                },
                true,
            ),
        ).toMatchObject({ modality: "transcription" });
    });
});

describe("endpointAgentBody", () => {
    it("builds the endpoint-agent registration body without proxy fields", () => {
        expect(
            endpointAgentBody({
                name: "floret",
                title: "Floret",
                description: "Agent orchestration endpoint",
                baseUrl: "https://floret.example.com/v1",
                upstreamModel: "floret",
                visibility: "private",
                perUserRpm: "10",
                bearerToken: "must-not-send",
            }),
        ).toEqual({
            name: "floret",
            title: "Floret",
            description: "Agent orchestration endpoint",
            baseUrl: "https://floret.example.com/v1",
            upstreamModel: "floret",
            visibility: "private",
            perUserRpm: 10,
        });
    });
});
