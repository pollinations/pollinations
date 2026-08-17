import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createMCPResponse,
    createTextContent,
    fetchResponseWithAuth,
    uploadMediaResponse,
} from "../utils/coreUtils.js";

async function transformMedia(params, context) {
    requireApiKey(context);

    const response = await fetchResponseWithAuth(
        buildUrl("/v1/media/transforms"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(params),
        },
        context,
    );
    const { contentType, mediaUrl } = await uploadMediaResponse(
        response,
        context,
    );

    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "Transformed media",
            mimeType: contentType,
        },
        createTextContent({ ...params, url: mediaUrl }, true),
    ]);
}

export const mediaTools = [
    [
        "transformMedia",
        "Trim or resize a video, extract audio, or capture a frame. Returns an unlisted media.pollinations.ai resource link without placing binary data in model context.",
        {
            source: z.string().url().describe("Public HTTP(S) media URL"),
            mode: z.enum(["video", "audio", "frame"]),
            time: z
                .number()
                .min(0)
                .max(600)
                .default(0)
                .describe("Start time in seconds"),
            duration: z
                .number()
                .min(1)
                .max(60)
                .optional()
                .describe("Required for video and audio output, in seconds"),
            width: z.number().int().min(10).max(2000).optional(),
            height: z.number().int().min(10).max(2000).optional(),
            fit: z.enum(["contain", "cover", "scale-down"]).optional(),
            audio: z
                .boolean()
                .optional()
                .describe("Include audio in video output"),
            format: z
                .enum(["jpg", "png"])
                .optional()
                .describe("Frame image format"),
        },
        transformMedia,
    ],
];
