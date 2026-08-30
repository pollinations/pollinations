import type { ModelInfo } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    AUTO_ROUTING,
    agentChoices,
    arrayBufferToBase64,
    audioFormat,
    buildUserContent,
    compactRouting,
    conversationForRequest,
    extractStreamedMedia,
    fileKind,
    routingChoices,
    supportsRoutingField,
} from "./chat-models";

function model(overrides: Partial<ModelInfo>): ModelInfo {
    return {
        id: "model-id",
        name: "model-id",
        title: "Model",
        category: "text",
        input_modalities: ["text"],
        output_modalities: ["text"],
        ...overrides,
    };
}

describe("chat agents", () => {
    it("lists only catalog models explicitly marked as agents", () => {
        const choices = agentChoices([
            model({ id: "regular", title: "Regular" }),
            model({
                id: "coding-agent",
                title: "Coding Agent",
                agent: true,
            }),
            model({
                id: undefined,
                name: "community-agent",
                title: "Community Agent",
                agent: true,
                input_modalities: ["text", "image"],
            }),
        ]);

        expect(choices).toEqual([
            {
                id: "coding-agent",
                title: "Coding Agent",
                inputModalities: ["text"],
            },
            {
                id: "community-agent",
                title: "Community Agent",
                inputModalities: ["text", "image"],
            },
        ]);
    });
});

describe("chat routing models", () => {
    it.each([
        ["text", model({})],
        ["web_search", model({ capabilities: ["web_search"] })],
        [
            "image_generation",
            model({
                category: "image",
                output_modalities: ["image"],
            }),
        ],
        [
            "image_editing",
            model({
                category: "image",
                input_modalities: ["text", "image"],
                output_modalities: ["image"],
            }),
        ],
        [
            "video",
            model({
                category: "video",
                output_modalities: ["video"],
            }),
        ],
        [
            "audio",
            model({
                category: "audio",
                output_modalities: ["audio"],
            }),
        ],
    ] as const)("accepts a compatible %s model", (field, candidate) => {
        expect(supportsRoutingField(candidate, field)).toBe(true);
    });

    it("requires image input for image editing", () => {
        expect(
            supportsRoutingField(
                model({
                    category: "image",
                    output_modalities: ["image"],
                }),
                "image_editing",
            ),
        ).toBe(false);
    });

    it("only lists allowed official models and excludes floret", () => {
        const choices = routingChoices(
            [
                model({ id: "allowed", title: "Allowed" }),
                model({ id: "blocked", title: "Blocked" }),
                model({ id: "community", community: true }),
                model({ id: "floret", title: "Floret" }),
            ],
            new Set(["allowed", "community", "floret"]),
            "text",
        );

        expect(choices.map((choice) => choice.id)).toEqual(["allowed"]);
    });

    it("omits routing while every capability is Auto", () => {
        expect(compactRouting(AUTO_ROUTING)).toBeUndefined();
    });

    it("includes only explicit routing overrides", () => {
        expect(
            compactRouting({
                ...AUTO_ROUTING,
                web_search: "gemini-search",
                video: "veo",
            }),
        ).toEqual({ web_search: "gemini-search", video: "veo" });
    });
});

describe("chat attachments", () => {
    it.each([
        ["photo.png", "image/png", "image"],
        ["clip.mp4", "video/mp4", "video"],
        ["voice.mp3", "audio/mpeg", "audio"],
        ["notes.pdf", "application/pdf", "file"],
        ["photo.webp", "", "image"],
    ] as const)("classifies %s as %s content", (name, mimeType, expected) => {
        expect(fileKind({ name, type: mimeType })).toBe(expected);
    });

    it.each([
        ["recording.mp3", "audio/mpeg", "mp3"],
        ["recording.wav", "audio/wav", "wav"],
        ["recording.flac", "audio/flac", "flac"],
        ["recording.opus", "audio/opus", "opus"],
    ] as const)("maps %s to supported %s audio", (name, mimeType, expected) => {
        expect(audioFormat({ name, type: mimeType })).toBe(expected);
    });

    it("rejects unsupported audio formats", () => {
        expect(
            audioFormat({ name: "recording.aac", type: "audio/aac" }),
        ).toBeNull();
    });

    it("encodes audio bytes without a data URL prefix", () => {
        expect(
            arrayBufferToBase64(Uint8Array.from([0, 1, 2, 255]).buffer),
        ).toBe("AAEC/w==");
    });

    it("builds text-first mixed user content", () => {
        expect(
            buildUserContent(" describe this ", [
                {
                    type: "image_url",
                    image_url: { url: "https://example.test/image.png" },
                },
            ]),
        ).toEqual([
            { type: "text", text: "describe this" },
            {
                type: "image_url",
                image_url: { url: "https://example.test/image.png" },
            },
        ]);
    });
});

describe("chat conversation history", () => {
    it("keeps complete history and useful cancelled assistant text", () => {
        expect(
            conversationForRequest([
                {
                    id: "u1",
                    role: "user",
                    content: "hello",
                    status: "complete",
                },
                {
                    id: "a1",
                    role: "assistant",
                    content: "hi",
                    status: "complete",
                },
                {
                    id: "u2",
                    role: "user",
                    content: "continue",
                    status: "complete",
                },
                {
                    id: "a2",
                    role: "assistant",
                    content: "partial",
                    status: "cancelled",
                },
                {
                    id: "a3",
                    role: "assistant",
                    content: "",
                    status: "error",
                },
            ]),
        ).toEqual([
            { role: "user", content: "hello" },
            { role: "assistant", content: "hi" },
            { role: "user", content: "continue" },
            { role: "assistant", content: "partial" },
        ]);
    });
});

describe("streamed media rendering", () => {
    it("extracts and deduplicates generated media while preserving normal links", () => {
        const result = extractStreamedMedia(
            "Here is it.\n\n![flower](https://media.test/flower.png?x=1)\n" +
                "[video](https://media.test/demo.mp4)\n" +
                "[again](https://media.test/demo.mp4)\n" +
                "[docs](https://docs.test/guide)",
        );

        expect(result.media).toEqual([
            {
                kind: "image",
                url: "https://media.test/flower.png?x=1",
                label: "flower",
            },
            {
                kind: "video",
                url: "https://media.test/demo.mp4",
                label: "video",
            },
        ]);
        expect(result.markdown).toContain("[docs](https://docs.test/guide)");
        expect(result.markdown).not.toContain("flower.png");
        expect(result.markdown).not.toContain("demo.mp4");
    });

    it("does not embed unsafe or unfinished links", () => {
        const markdown =
            "[audio](javascript:alert(1)) and ![half](https://media.test/pic";
        expect(extractStreamedMedia(markdown)).toEqual({
            markdown,
            media: [],
        });
    });
});
