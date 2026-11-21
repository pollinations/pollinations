import { expect, it } from "vitest";
import { type AgentItem, replyMedia, withoutMedia } from "./agent-turn";

it("treats only files on the media host as reply media", () => {
    const text = [
        "![a](javascript:alert(1))",
        "![b](data:text/html;base64,PHNjcmlwdD4=)",
        "![c](//evil.example/x.png)",
        "![d](http://plain.example/x.png)",
        "![e](https://cdn.example/x.png)",
        "![f](/art/sample.webp)",
        "[audio: hi](https://media.pollinations.ai/da44fc53-4600)",
    ].join("\n");
    const tool = {
        type: "tool" as const,
        callId: "1",
        name: "t",
        arguments: {},
        result: {
            output: {
                content: [
                    {
                        type: "resource_link",
                        uri: "javascript:alert(2)",
                        mimeType: "image/png",
                    },
                    {
                        type: "resource_link",
                        uri: "https://media.pollinations.ai/abc",
                        mimeType: "audio/mpeg",
                    },
                ],
            },
        },
    };
    const media = replyMedia([{ type: "text", text }, tool], true);
    expect(media).toEqual([
        "https://media.pollinations.ai/da44fc53-4600",
        "https://media.pollinations.ai/abc",
    ]);
    const shown = withoutMedia(text, media);
    expect(shown).toContain("javascript:alert(1)");
    expect(shown).toContain("https://cdn.example/x.png");
    expect(shown).not.toContain("media.pollinations.ai");
});

it("keeps a media link whole", () => {
    const text =
        "Here: https://media.pollinations.ai/clip.mp4?v=2. And [Generated video](<https://media.pollinations.ai/opaque-id>)";
    const media = replyMedia([{ type: "text", text }], true);
    expect(media).toEqual([
        "https://media.pollinations.ai/clip.mp4?v=2",
        "https://media.pollinations.ai/opaque-id",
    ]);
    expect(withoutMedia(text, media)).not.toContain("Generated video");
});

it("reads links from text only once the text is complete", () => {
    const items: AgentItem[] = [
        { type: "text", text: "![image](https://media.pollinations.ai/da44" },
        {
            type: "tool",
            callId: "1",
            name: "t",
            arguments: {},
            result: {
                output: {
                    content: [
                        {
                            type: "resource_link",
                            uri: "https://media.pollinations.ai/abc",
                        },
                    ],
                },
            },
        },
    ];
    expect(replyMedia(items, false)).toEqual([
        "https://media.pollinations.ai/abc",
    ]);
});
