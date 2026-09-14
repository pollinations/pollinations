import type { ModelInfo } from "@pollinations/sdk";
import { describe, expect, it } from "vitest";
import {
    AUTO_ROUTING,
    agentChoices,
    arrayBufferToBase64,
    audioFormat,
    buildUserContent,
    compactRouting,
    FLORET_MODEL_ID,
    fileKind,
    parseAgentMessage,
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
    it("keeps canonical production agent IDs from the public catalog", () => {
        const choices = agentChoices([
            model({
                id: undefined,
                name: "community/pollinations-router/floret",
                title: "Floret",
                agent: true,
            }),
            model({
                id: undefined,
                name: "community/pollinations-router/polli",
                title: "Polli",
                agent: true,
            }),
        ]);
        expect(choices.map(({ id }) => id)).toEqual([
            FLORET_MODEL_ID,
            "community/pollinations-router/polli",
        ]);
    });
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

    it("only lists allowed official models and excludes agents", () => {
        const choices = routingChoices(
            [
                model({ id: "allowed", title: "Allowed" }),
                model({ id: "blocked", title: "Blocked" }),
                model({ id: "community", community: true }),
                model({ id: FLORET_MODEL_ID, title: "Floret", agent: true }),
                model({ id: "official-agent", agent: true }),
            ],
            new Set([
                "allowed",
                "community",
                FLORET_MODEL_ID,
                "official-agent",
            ]),
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

describe("agent tool-call rendering", () => {
    it("converts completed tool details into a structured message part", () => {
        const content =
            'I found it.\n\n<details type="tool_calls" done="true" id="call-1" ' +
            'name="SEARCH_WEB" arguments="{&quot;query&quot;:&quot;pollinations&quot;}">\n' +
            "<summary>Tool Executed</summary>\n" +
            "{&quot;results&quot;:[{&quot;title&quot;:&quot;Pollinations &amp; friends&quot;}]}\n" +
            "</details>\n\nDone.";

        expect(parseAgentMessage(content)).toEqual([
            { type: "text", text: "I found it.\n\n" },
            {
                type: "tool-call",
                toolCallId: "call-1",
                toolName: "SEARCH_WEB",
                args: { query: "pollinations" },
                argsText: '{"query":"pollinations"}',
                result: {
                    results: [{ title: "Pollinations & friends" }],
                },
                isError: false,
            },
            { type: "text", text: "\n\nDone." },
        ]);
    });

    it("marks failed tools and keeps their readable error", () => {
        const content =
            '<details type="tool_calls" done="true" id="call-2" ' +
            'name="SEND_EMAIL" arguments="{}">\n' +
            "<summary>Tool Failed</summary>\nMailbox unavailable\n</details>";

        expect(parseAgentMessage(content)).toEqual([
            {
                type: "tool-call",
                toolCallId: "call-2",
                toolName: "SEND_EMAIL",
                args: {},
                argsText: "{}",
                result: "Mailbox unavailable",
                isError: true,
            },
        ]);
    });

    it("leaves malformed or unrelated details as text", () => {
        const content =
            "<details><summary>More</summary>Not a tool call</details>";
        expect(parseAgentMessage(content)).toEqual([
            { type: "text", text: content },
        ]);
    });
});
