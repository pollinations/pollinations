import type { ModelInfo } from "@pollinations/sdk";
import { PolliProvider } from "@pollinations/sdk/react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { attachmentKinds, Chat, MessageCard, welcomeMessage } from "./Chat";
import { FLORET_MODEL_ID } from "./chat-models";
import type { PollinationsUIMessage } from "./pollinations-chat-transport";

function renderMessage(parts: PollinationsUIMessage["parts"]) {
    return renderToStaticMarkup(
        <MessageCard
            message={{ id: "response", role: "assistant", parts }}
            assistantName="Floret"
            isStreaming={false}
            canRetry={false}
            onRetry={() => {}}
        />,
    );
}

describe("Floret identity", () => {
    const floret = {
        id: "community/pollinations-ai/floret",
        title: "Floret",
        inputModalities: ["text"],
    };

    it("uses the Floret welcome with the current public identity", () => {
        expect(floret.id).toBe(FLORET_MODEL_ID);
        const welcome = welcomeMessage(floret);
        expect(welcome.metadata?.localOnly).toBe(true);
        expect(welcome.parts).toEqual([
            { type: "text", text: expect.stringContaining("Hi, I’m Floret") },
        ]);
    });

    it("enables Floret attachments without granting them to unrelated text-only agents", () => {
        expect([...attachmentKinds(floret)]).toEqual([
            "image",
            "video",
            "audio",
            "file",
        ]);
        expect([
            ...attachmentKinds({ ...floret, id: "unrelated/floret" }),
        ]).toEqual([]);
        expect([...attachmentKinds(undefined)]).toEqual([]);
    });
});

describe("agent selection UI", () => {
    const agent = (name: string, title: string): ModelInfo => ({
        name,
        title,
        category: "text",
        agent: true,
        input_modalities: ["text"],
        output_modalities: ["text"],
    });
    const renderChat = (models: ModelInfo[]) =>
        renderToStaticMarkup(
            <PolliProvider appKey="pk_test">
                <Chat
                    active
                    catalog={{
                        models,
                        allowedModelIds: new Set(),
                        isLoggedIn: false,
                        isLoading: false,
                        error: null,
                        refresh: async () => {},
                    }}
                />
            </PolliProvider>,
        );

    it("starts with Floret even when another agent appears first", () => {
        const html = renderChat([
            agent("other-agent", "Other"),
            agent(FLORET_MODEL_ID, "Floret"),
        ]);
        expect(html).toContain('aria-label="Agent: Floret"');
        expect(html).toContain('placeholder="Message Floret…"');
        expect(html).not.toContain('aria-label="Selected model capabilities"');
        expect(html).not.toContain('aria-label="Routing,');
        expect(html).not.toContain("play-chat-routing");
    });

    it("offers an enabled selector instead of silently starting another agent", () => {
        const html = renderChat([agent("other-agent", "Other")]);
        expect(html).toContain(
            "Floret is unavailable. Choose another agent to continue.",
        );
        const trigger = html.match(
            /<button[^>]*aria-label="Agent: Choose an agent"[^>]*>/,
        )?.[0];
        expect(trigger).toBeDefined();
        expect(trigger).not.toContain("disabled");
        expect(html).not.toContain("<textarea");
    });

    it("shows an honest empty state when no agents are available", () => {
        const html = renderChat([]);
        expect(html).toContain("No agents are available right now.");
        const trigger = html.match(
            /<button[^>]*aria-label="Agent: No agents available"[^>]*>/,
        )?.[0];
        expect(trigger).toContain("disabled");
    });
});

describe("chat media placement", () => {
    it.each([
        "user",
        "assistant",
    ] as const)("renders %s content without a visible sender header", (role) => {
        const html = renderToStaticMarkup(
            <MessageCard
                message={{
                    id: "plain-message",
                    role,
                    parts: [{ type: "text", text: "Hello there" }],
                }}
                assistantName="Floret"
                isStreaming={false}
                canRetry={false}
                onRetry={() => {}}
            />,
        );
        expect(html).toContain("Hello there");
        expect(html).not.toContain("<header");
        expect(html).toContain(
            `aria-label="${role === "user" ? "Your message" : "Floret message"}"`,
        );
    });

    it("keeps images between their surrounding paragraphs", () => {
        const html = renderMessage([
            {
                type: "text",
                text: "Daytime scene\n\n![Day](https://example.test/day.png)\n\nNighttime scene\n\n![Night](https://example.test/night.png)\n\nCompare the lighting.",
            },
        ]);

        const positions = [
            ">Daytime scene<",
            'alt="Day"',
            ">Nighttime scene<",
            'alt="Night"',
            ">Compare the lighting.<",
        ].map((text) => html.indexOf(text));
        expect(positions.every((position) => position >= 0)).toBe(true);
        expect(positions).toEqual([...positions].sort((a, b) => a - b));
        expect(html.match(/<img /g)).toHaveLength(2);
    });

    it("renders a media-only response inside the message", () => {
        const html = renderMessage([
            {
                type: "text",
                text: "![Result](https://example.test/image.png)",
            },
        ]);
        expect(html).toContain("Floret");
        expect(html).toContain('alt="Result"');
        expect(html).toContain('aria-label="Copy response"');
    });
});
