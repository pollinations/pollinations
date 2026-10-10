import { getRegistryModelDefinition } from "@shared/registry/registry.ts";
import { afterEach, describe, expect, it, vi } from "vitest";
import { findModelByName } from "../../../src/text/availableModels.js";

const transform = findModelByName("amazon/nova-2-lite-v1")?.transform;
if (!transform) throw new Error("Nova 2 Lite transform missing");

/** `ftyp` box header — enough bytes to stand in for an MP4. */
const MP4_BYTES = new Uint8Array([
    0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x6d, 0x70, 0x34, 0x32,
]);
const MP4_BASE64 = Buffer.from(MP4_BYTES).toString("base64");

afterEach(() => {
    vi.restoreAllMocks();
});

function videoMessage(url: string, mime_type?: string) {
    return [
        {
            role: "user",
            content: [
                { type: "text", text: "What happens in this clip?" },
                {
                    type: "video_url",
                    video_url: { url, ...(mime_type && { mime_type }) },
                },
            ],
        },
    ];
}

describe("Nova 2 Lite media input", () => {
    it("advertises video input", () => {
        expect(
            getRegistryModelDefinition("amazon/nova-2-lite-v1").inputModalities,
        ).toEqual(["text", "image", "video"]);
    });

    it("turns a remote video_url into an inline Bedrock video file", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(MP4_BYTES, {
                headers: { "content-type": "video/mp4" },
            }),
        );

        const { messages } = await transform(
            videoMessage("https://example.com/clip.mp4"),
            {},
        );

        expect(fetchMock).toHaveBeenCalledOnce();
        expect(messages[0].content).toEqual([
            { type: "text", text: "What happens in this clip?" },
            {
                type: "file",
                file: { file_data: MP4_BASE64, mime_type: "video/mp4" },
            },
        ]);
    });

    it("maps standard MIME names onto the ones Bedrock expects", async () => {
        const { messages } = await transform(
            videoMessage(`data:video/quicktime;base64,${MP4_BASE64}`),
            {},
        );

        expect(messages[0].content).toContainEqual({
            type: "file",
            file: { file_data: MP4_BASE64, mime_type: "video/mov" },
        });
    });

    it("prefers the caller's mime_type over the host's content type", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response(MP4_BYTES, {
                headers: { "content-type": "application/octet-stream" },
            }),
        );

        const { messages } = await transform(
            videoMessage("https://example.com/clip", "video/webm"),
            {},
        );

        expect(messages[0].content).toContainEqual({
            type: "file",
            file: { file_data: MP4_BASE64, mime_type: "video/webm" },
        });
    });

    it("rejects video formats Bedrock cannot read", async () => {
        await expect(
            transform(videoMessage(`data:image/png;base64,${MP4_BASE64}`), {}),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("rejects private video URLs before fetching", async () => {
        const fetchMock = vi.spyOn(globalThis, "fetch");

        await expect(
            transform(videoMessage("http://127.0.0.1/clip.mp4"), {}),
        ).rejects.toMatchObject({
            status: 400,
            message:
                "Invalid media URL http://127.0.0.1/clip.mp4: private or credentialed URLs are not allowed.",
        });
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("explains why a video host cannot serve it", async () => {
        vi.spyOn(globalThis, "fetch").mockResolvedValue(
            new Response("missing", { status: 404, statusText: "Not Found" }),
        );

        await expect(
            transform(videoMessage("https://example.com/clip.mp4"), {}),
        ).rejects.toMatchObject({
            status: 400,
            message:
                "Failed to fetch media from https://example.com/clip.mp4: HTTP 404 Not Found. The media was not found. Please check the URL is correct.",
        });
    });

    it("refuses audio instead of letting Bedrock drop it", async () => {
        await expect(
            transform(
                [
                    {
                        role: "user",
                        content: [
                            {
                                type: "input_audio",
                                input_audio: {
                                    data: "UklGRg==",
                                    format: "wav",
                                },
                            },
                        ],
                    },
                ],
                {},
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    it("leaves text and image parts untouched", async () => {
        const input = [
            { role: "system", content: "Be brief." },
            {
                role: "user",
                content: [
                    { type: "text", text: "Describe it." },
                    {
                        type: "image_url",
                        image_url: { url: "https://example.com/a.png" },
                    },
                ],
            },
        ];

        const { messages } = await transform(input, {});

        expect(messages).toEqual(input);
    });
});
