import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageCard } from "./Chat";
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
