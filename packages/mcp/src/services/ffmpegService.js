import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchAndUploadMedia,
} from "../utils/coreUtils.js";

async function runFfmpeg(params, context) {
    requireApiKey(context);

    const { contentType, mediaUrl } = await fetchAndUploadMedia(
        buildUrl("/v1/media/ffmpeg"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        },
        context,
    );
    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "FFmpeg output",
            mimeType: contentType,
        },
        createTextContent(
            { ...params, url: mediaUrl, mimeType: contentType },
            true,
        ),
    ]);
}

export const ffmpegTools = [
    [
        "runFfmpeg",
        "Run native FFmpeg arguments against a Pollinations media URL and return the output as an unlisted media.pollinations.ai resource link. Supply arguments exactly as FFmpeg expects after the input and before the output path; omit ffmpeg, -i, and the output path.",
        {
            source: z
                .url()
                .refine((value) => {
                    const url = new URL(value);
                    return (
                        url.protocol === "https:" &&
                        url.hostname === "media.pollinations.ai" &&
                        !url.username &&
                        !url.password
                    );
                }, "source must be an HTTPS media.pollinations.ai URL without credentials")
                .describe(
                    "Input URL previously stored on media.pollinations.ai",
                ),
            args: z
                .array(z.string().min(1).max(1024))
                .max(64)
                .refine(
                    (args) => !args.includes("-i"),
                    "omit -i; Pollinations supplies the input",
                )
                .describe(
                    "FFmpeg argv after the input and before the output, for example ['-ss','2','-t','5','-vf','scale=640:-2','-c:v','libx264']",
                ),
            outputExtension: z
                .enum([
                    "mp4",
                    "webm",
                    "mov",
                    "mp3",
                    "m4a",
                    "wav",
                    "flac",
                    "ogg",
                    "gif",
                    "jpg",
                    "jpeg",
                    "png",
                ])
                .describe("Single-file output format"),
        },
        runFfmpeg,
    ],
];
