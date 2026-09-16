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
import { ensureAzureImageOk } from "./azureFluxKontextModel.ts";

const logCloudflare = debug("pollinations:cloudflare");

const AZURE_MAI_ENDPOINT =
    "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images";
const AZURE_MAI_DEPLOYMENT = "MAI-Image-2.5-Flash";
const AZURE_MAI_TITLE = "MAI Image 2.5 Flash";
// Azure MAI generation limits (docs and live 400s): each side at least 768px,
// 16px steps (Azure otherwise snaps down silently), at most 1024x1024 pixels.
const AZURE_MAI_MIN_SIDE = 768;
const AZURE_MAI_DIMENSION_STEP = 16;
const AZURE_MAI_MAX_PIXELS = 1024 * 1024;

type AzureMaiResponse = {
    data?: Array<{ b64_json?: string }>;
    usage?: {
        num_input_text_tokens?: number;
        num_input_image_tokens?: number;
        num_output_tokens?: number;
    };
};

function validateMaiDimensions(width: number, height: number): void {
    if (width < AZURE_MAI_MIN_SIDE || height < AZURE_MAI_MIN_SIDE) {
        throw UpstreamError.fromProvider(400, {
            message: `${AZURE_MAI_TITLE} requires width and height of at least ${AZURE_MAI_MIN_SIDE}px`,
        });
    }
    if (
        width % AZURE_MAI_DIMENSION_STEP !== 0 ||
        height % AZURE_MAI_DIMENSION_STEP !== 0
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `${AZURE_MAI_TITLE} requires width and height to be multiples of ${AZURE_MAI_DIMENSION_STEP}px`,
        });
    }
    if (width * height > AZURE_MAI_MAX_PIXELS) {
        throw UpstreamError.fromProvider(400, {
            message: `${AZURE_MAI_TITLE} supports at most 1,048,576 pixels (width × height)`,
        });
    }
}

function tokenCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) && value > 0
        ? value
        : 0;
}

async function editFormData(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<FormData> {
    const { buffer, mimeType } = await downloadUserImage(safeParams.image[0]);
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

    // Edits take the reference as multipart; Azure rejects width/height here.
    const formData = new FormData();
    formData.append("model", AZURE_MAI_DEPLOYMENT);
    formData.append("prompt", sanitizeString(prompt));
    formData.append(
        "image",
        new Blob([bufferToUint8Array(buffer)], { type: mimeType }),
        `image.${mimeType.split("/")[1] || "png"}`,
    );
    return formData;
}

export async function callAzureMaiImage(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    if (safeParams.transparent) {
        throw UpstreamError.fromProvider(400, {
            message: `Transparent backgrounds are not supported by ${safeParams.model}.`,
        });
    }
    if (safeParams.image.length > 1) {
        throw UpstreamError.fromProvider(400, {
            message: `${AZURE_MAI_TITLE} supports at most 1 reference image`,
        });
    }
    const isEdit = safeParams.image.length === 1;
    if (!isEdit) {
        validateMaiDimensions(safeParams.width, safeParams.height);
    }

    const apiKey = getImageEnv("AZURE_MYCELI_PROD_API_KEY");
    if (!apiKey) {
        throw new Error(
            "AZURE_MYCELI_PROD_API_KEY not found in environment variables",
        );
    }

    await requireSafePrompt(prompt, safeParams, userInfo);

    const endpoint = `${AZURE_MAI_ENDPOINT}/${isEdit ? "edits" : "generations"}`;
    const headers: Record<string, string> = { "api-key": apiKey };
    let body: BodyInit;
    if (isEdit) {
        body = await editFormData(prompt, safeParams, userInfo);
    } else {
        headers["Content-Type"] = "application/json";
        // Only these fields are accepted; seed, quality and guidance are 400s.
        body = JSON.stringify({
            model: AZURE_MAI_DEPLOYMENT,
            prompt: sanitizeString(prompt),
            width: safeParams.width,
            height: safeParams.height,
        });
    }

    logCloudflare(
        `Calling Azure ${AZURE_MAI_TITLE} in ${isEdit ? "edit" : "generation"} mode`,
    );
    const response = await fetch(endpoint, { method: "POST", headers, body });
    await ensureAzureImageOk(response, endpoint);

    const data = (await response.json()) as AzureMaiResponse;
    const encodedImage = data.data?.[0]?.b64_json;
    const responseSummary = JSON.stringify({
        responseKeys: Object.keys(data).sort(),
        dataCount: Array.isArray(data.data) ? data.data.length : undefined,
        usage: data.usage,
    });
    if (!encodedImage) {
        throw new UpstreamError(502, {
            message: `Azure ${AZURE_MAI_TITLE} returned no image`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody: responseSummary,
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }

    const completionImageTokens = tokenCount(data.usage?.num_output_tokens);
    if (completionImageTokens === 0) {
        throw new UpstreamError(502, {
            message: `Azure ${AZURE_MAI_TITLE} returned no billing metadata`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody: responseSummary,
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }
    const promptTextTokens = tokenCount(data.usage?.num_input_text_tokens);
    const promptImageTokens = tokenCount(data.usage?.num_input_image_tokens);

    return {
        buffer: base64ToBuffer(encodedImage),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                ...(promptTextTokens > 0 ? { promptTextTokens } : {}),
                ...(promptImageTokens > 0 ? { promptImageTokens } : {}),
                completionImageTokens,
            },
        },
    };
}
