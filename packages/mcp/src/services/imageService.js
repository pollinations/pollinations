import { z } from "zod";
import { requireApiKey } from "../utils/authUtils.js";
import {
    buildUrl,
    createImageContent,
    createMCPResponse,
    createTextContent,
    fetchJsonWithAuth,
    fetchMediaWithAuth,
} from "../utils/coreUtils.js";
import { validateImageModel, validateVideoModel } from "../utils/models.js";

function imageMimeType(base64, declaredMimeType) {
    if (declaredMimeType) return declaredMimeType;
    if (base64.startsWith("iVBOR")) return "image/png";
    if (base64.startsWith("UklGR")) return "image/webp";
    if (base64.startsWith("R0lGOD")) return "image/gif";
    if (base64.startsWith("PHN2Zy") || base64.startsWith("PD94bWw")) {
        return "image/svg+xml";
    }
    return "image/jpeg";
}

async function generateImage(params, context) {
    requireApiKey(context);

    if (params.model) {
        const validation = await validateImageModel(params.model, context);
        if (!validation.valid) {
            throw new Error(
                `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                    "Use listModels with type=image to see all available models.",
            );
        }
    }

    const body = {
        prompt: params.prompt,
        model: params.model,
        n: params.n,
        size: params.size,
        quality: params.quality,
        response_format: params.response_format,
        user: params.user,
        image: params.image,
        safe: params.safe,
        seed: params.seed,
        transparent: params.transparent,
        guidance_scale: params.guidance_scale,
    };
    const result = await fetchJsonWithAuth(
        buildUrl("/v1/images/generations"),
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        },
        context,
    );
    const image = result.data?.[0];
    if (!image) throw new Error("Image API returned no image data");

    const content = [];
    if (image.url) {
        content.push({
            type: "resource_link",
            uri: image.url,
            name: "Generated image",
            ...(image.media_type ? { mimeType: image.media_type } : {}),
        });
    } else if (image.b64_json) {
        content.push(
            createImageContent(
                image.b64_json,
                imageMimeType(image.b64_json, image.media_type),
            ),
        );
    } else {
        throw new Error("Image API returned neither a URL nor base64 data");
    }

    content.push(
        createTextContent(
            {
                ...result,
                data: result.data.map(({ b64_json, ...entry }) =>
                    b64_json ? { ...entry, encoding: "base64" } : entry,
                ),
            },
            true,
        ),
    );
    return createMCPResponse(content);
}

async function prepareVideoRequest(params, context) {
    const {
        prompt,
        model = "veo",
        duration,
        aspectRatio,
        audio,
        image,
        seed,
        safe,
    } = params;

    const validation = await validateVideoModel(model, context);
    if (!validation.valid) {
        throw new Error(
            `${validation.error} Did you mean: ${validation.suggestions.join(", ")}? ` +
                "Use listModels with type=video to see all available models.",
        );
    }

    return {
        encodedPrompt: encodeURIComponent(prompt),
        queryParams: {
            model,
            duration,
            aspectRatio,
            audio,
            image,
            seed,
            safe,
        },
    };
}

async function generateVideo(params, context) {
    requireApiKey(context);

    const { encodedPrompt, queryParams } = await prepareVideoRequest(
        params,
        context,
    );
    const { contentType, mediaUrl } = await fetchMediaWithAuth(
        buildUrl(`/video/${encodedPrompt}`, queryParams),
        {},
        context,
    );
    if (!mediaUrl) throw new Error("Video API returned no media URL");

    return createMCPResponse([
        {
            type: "resource_link",
            uri: mediaUrl,
            name: "Generated video",
            mimeType: contentType || "video/mp4",
        },
        createTextContent(
            {
                prompt: params.prompt,
                ...queryParams,
                url: mediaUrl,
            },
            true,
        ),
    ]);
}

const imageParamsSchema = {
    prompt: z.string().min(1).max(32000).describe("Image prompt"),
    model: z
        .string()
        .optional()
        .describe("Image model. Use listModels with type=image"),
    n: z
        .literal(1)
        .optional()
        .describe("Number of images (the API currently supports 1)"),
    size: z
        .string()
        .optional()
        .describe("Image size as WIDTHxHEIGHT, for example 1024x1024"),
    quality: z
        .enum(["standard", "hd", "low", "medium", "high"])
        .optional()
        .describe("Image quality"),
    response_format: z
        .enum(["url", "b64_json"])
        .optional()
        .describe(
            "API response format. url returns an MCP resource link; b64_json returns MCP image data (API default)",
        ),
    user: z.string().optional().describe("End-user identifier"),
    image: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("HTTP(S) image URL or URLs to edit or use as references"),
    safe: z
        .union([z.string(), z.boolean()])
        .optional()
        .describe("Pollinations safety options"),
    seed: z.number().int().optional().describe("Random seed"),
    transparent: z
        .boolean()
        .optional()
        .describe("Request a transparent background where supported"),
    guidance_scale: z
        .number()
        .optional()
        .describe("Guidance scale where supported"),
};

const videoParamsSchema = {
    prompt: z.string().min(1).describe("Video prompt"),
    model: z
        .string()
        .optional()
        .describe("Video model (default: veo). Use listModels with type=video"),
    duration: z.number().optional().describe("Video duration in seconds"),
    aspectRatio: z
        .string()
        .optional()
        .describe("Aspect ratio, for example 16:9 or 9:16"),
    audio: z
        .boolean()
        .optional()
        .describe("Generate audio where the model supports it"),
    image: z
        .union([z.string(), z.array(z.string())])
        .optional()
        .describe("Reference image URL or URLs for image-to-video generation"),
    seed: z.number().int().optional().describe("Random seed"),
    safe: z
        .union([z.string(), z.boolean()])
        .optional()
        .describe("Pollinations safety options"),
};

export const imageTools = [
    [
        "generateImage",
        "Generate or edit one image through POST /v1/images/generations. To edit, provide an HTTP(S) reference in image. Set response_format to url for a resource link or b64_json for MCP image data.",
        imageParamsSchema,
        generateImage,
    ],
    [
        "generateVideo",
        "Generate one video and return a public MCP resource link.",
        videoParamsSchema,
        generateVideo,
    ],
];
