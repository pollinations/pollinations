import { expect, it } from "vitest";
import { replyMedia, withoutMedia } from "./agent-turn";

it("treats only https and same-site links as reply media", () => {
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
    const media = replyMedia([{ type: "text", text }, tool]);
    expect(media).toEqual([
        "https://cdn.example/x.png",
        "/art/sample.webp",
        "https://media.pollinations.ai/da44fc53-4600",
        "https://media.pollinations.ai/abc",
    ]);
    expect(withoutMedia(text, media)).toContain("javascript:alert(1)");
});
