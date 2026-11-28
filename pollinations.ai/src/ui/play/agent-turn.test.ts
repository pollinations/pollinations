import { expect, it } from "vitest";
import {
    type AgentItem,
    finalMedia,
    replyMedia,
    userParts,
    withoutMedia,
} from "./agent-turn";

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

it("takes the last files made as the result and the rest as process", () => {
    const made = (callId: string, ...files: string[]) => ({
        type: "tool" as const,
        callId,
        name: "t",
        arguments: {},
        result: {
            output: {
                content: files.map((file) => ({
                    type: "resource_link",
                    uri: `https://media.pollinations.ai/${file}`,
                })),
            },
        },
    });
    const say = (text: string) => ({ type: "text" as const, text });
    // Frames, then the video stitched from them.
    expect(
        finalMedia(
            [
                made("1", "a.png"),
                made("2", "b.png"),
                say("Now the video."),
                made("3", "clip.mp4"),
                say("Done: https://media.pollinations.ai/a.png"),
            ],
            true,
        ),
    ).toEqual(["https://media.pollinations.ai/clip.mp4"]);
    // Files made side by side are one result; a step without a file ends the run.
    expect(
        finalMedia(
            [
                made("1", "old.png"),
                made("2"),
                made("3", "a.png"),
                made("4", "b.png"),
            ],
            true,
        ),
    ).toEqual([
        "https://media.pollinations.ai/a.png",
        "https://media.pollinations.ai/b.png",
    ]);
    // No tool returned a file: the links in the text are the result.
    expect(
        finalMedia([say("Here: https://media.pollinations.ai/x.png")], true),
    ).toEqual(["https://media.pollinations.ai/x.png"]);
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

it("sends the text first, then each attachment with its file name", () => {
    const attachments = [
        {
            url: "https://media.pollinations.ai/a",
            mediaType: "image/png",
            filename: "cat.png",
        },
        {
            url: "https://media.pollinations.ai/b",
            mediaType: "audio/mpeg",
            filename: "clip.mp3",
        },
        {
            url: "https://media.pollinations.ai/c",
            mediaType: "video/mp4",
            filename: "take.mp4",
        },
    ];
    const turn = {
        id: "1",
        prompt: "What is this?",
        items: [],
        status: "running" as const,
        attachments,
    };
    expect(userParts(turn)).toEqual([
        { type: "text", text: "What is this?" },
        ...attachments.map((attachment) => ({ type: "file", ...attachment })),
    ]);
    // An agent with tools also gets each image's link, as a plain file part.
    const [image] = attachments.filter(({ mediaType }) =>
        mediaType.startsWith("image/"),
    );
    expect(userParts({ ...turn, attachments: [image] }, true).slice(1)).toEqual(
        [
            { type: "file", ...image },
            { type: "file", url: image.url, filename: image.filename },
        ],
    );
    expect(userParts({ ...turn, attachments: undefined })).toEqual([
        { type: "text", text: "What is this?" },
    ]);
});
