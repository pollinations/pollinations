import { collectUpstreamHeaders, UpstreamError } from "@shared/error.ts";
import debug from "debug";
import type {
    AuthResult,
    ImageGenerationResult,
} from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import {
    analyzeImageSafety,
    requireSafePrompt,
} from "../utils/azureContentSafety.ts";
import { logGptImageError } from "../utils/gptImageLogger.ts";
import {
    base64ToBuffer,
    bufferToUint8Array,
    downloadUserImage,
} from "../utils/imageDownload.ts";

const logCloudflare = debug("pollinations:cloudflare");

const INFERENCEPORT_BASE_URL = "https://api.inferenceport.ai/v1/images";
const INFERENCEPORT_UPSTREAM_MODEL = "lightning-image-turbo";
const INFERENCEPORT_TITLE = "Lightning Image Turbo";
const INFERENCEPORT_MAX_REFERENCES = 4;

type InferencePortResponse = {
    data?: Array<{ b64_json?: string; url?: string }>;
};

async function downloadAndSafetyCheck(
    imageUrl: string,
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<{ buffer: Buffer; mimeType: string }> {
    const { buffer, mimeType } = await downloadUserImage(imageUrl);
    const imageSafetyResult = await analyzeImageSafety(buffer);
    if (!imageSafetyResult.safe) {
        const error = UpstreamError.fromProvider(400, {
            message: `Input image contains unsafe content: ${imageSafetyResult.formattedViolations}`,
        });
        await logGptImageError(
            prompt,
            safeParams,
            userInfo,
            error,
            imageSafetyResult,
        );
        throw error;
    }
    return { buffer, mimeType };
}

export async function callInferencePortImage(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    if (safeParams.transparent) {
        throw UpstreamError.fromProvider(400, {
            message: `Transparent backgrounds are not supported by ${safeParams.model}.`,
        });
    }
    if (safeParams.image.length > INFERENCEPORT_MAX_REFERENCES) {
        throw UpstreamError.fromProvider(400, {
            message: `${INFERENCEPORT_TITLE} supports at most ${INFERENCEPORT_MAX_REFERENCES} reference images`,
        });
    }

    const apiKey = getImageEnv("INFERENCEPORT_API_KEY");
    if (!apiKey) {
        throw new Error(
            "INFERENCEPORT_API_KEY not found in environment variables",
        );
    }

    await requireSafePrompt(prompt, safeParams, userInfo);

    const isEdit = safeParams.image.length > 0;
    const endpoint = `${INFERENCEPORT_BASE_URL}/${isEdit ? "edits" : "generations"}`;

    logCloudflare(
        `Calling InferencePort ${INFERENCEPORT_TITLE} in ${isEdit ? "edit" : "generation"} mode`,
    );

    let response: Response;
    if (isEdit) {
        const formData = new FormData();
        formData.append("model", INFERENCEPORT_UPSTREAM_MODEL);
        formData.append("prompt", sanitizeString(prompt));
        formData.append("n", "1");

        for (let i = 0; i < safeParams.image.length; i++) {
            const { buffer, mimeType } = await downloadAndSafetyCheck(
                safeParams.image[i],
                prompt,
                safeParams,
                userInfo,
            );
            formData.append(
                "image",
                new Blob([bufferToUint8Array(buffer)], { type: mimeType }),
                `image${i}.${mimeType.split("/")[1] || "png"}`,
            );
        }

        response = await fetch(endpoint, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}` },
            body: formData,
        });
    } else {
        response = await fetch(endpoint, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: INFERENCEPORT_UPSTREAM_MODEL,
                prompt: sanitizeString(prompt),
                n: 1,
            }),
        });
    }

    if (!response.ok) {
        let responseBody: string | undefined;
        try {
            responseBody = await response.text();
        } catch {}
        throw UpstreamError.fromProvider(response.status, {
            message: `InferencePort ${INFERENCEPORT_TITLE} returned ${response.status}`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody,
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }

    const data = (await response.json()) as InferencePortResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    const responseSummary = JSON.stringify({
        responseKeys: Object.keys(data).sort(),
        dataCount: Array.isArray(data.data) ? data.data.length : undefined,
    });

    if (!encodedImage) {
        throw new UpstreamError(502, {
            message: `InferencePort ${INFERENCEPORT_TITLE} returned no image`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody: responseSummary,
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }

    return {
        buffer: base64ToBuffer(encodedImage),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                completionImageTokens: 1,
                totalTokenCount: 1,
            },
        },
    };
}
