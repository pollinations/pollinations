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

const MAI_ROUTES = {
    "microsoft/mai-image-2.5-flash": {
        endpoint:
            "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images",
        deployment: "MAI-Image-2.5-Flash",
        key: "AZURE_MYCELI_PROD_API_KEY",
        title: "MAI Image 2.5 Flash",
        maxPixels: 1024 * 1024,
    },
    "microsoft/mai-image-2.6": {
        endpoint:
            "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images",
        deployment: "MAI-Image-2.6",
        key: "AZURE_MYCELI_PROD_API_KEY",
        title: "MAI Image 2.6",
        maxPixels: 1536 * 1536,
    },
    "microsoft/mai-image-2.6:azure:sweden": {
        endpoint:
            "https://myceli-prod-swedencentral.services.ai.azure.com/mai/v1/images",
        deployment: "MAI-Image-2.6",
        key: "AZURE_MYCELI_PROD_SWEDEN_API_KEY",
        title: "MAI Image 2.6",
        maxPixels: 1536 * 1536,
    },
} as const;
type MaiRoute = (typeof MAI_ROUTES)[keyof typeof MAI_ROUTES];
// Azure MAI generation limits (docs and live 400s): each side at least 768px,
// 16px steps (Azure otherwise snaps down silently); max pixels vary by model.
const AZURE_MAI_MIN_SIDE = 768;
const AZURE_MAI_DIMENSION_STEP = 16;

type AzureMaiResponse = {
    data?: Array<{ b64_json?: string }>;
    usage?: {
        num_input_text_tokens?: number;
        num_input_image_tokens?: number;
        num_output_tokens?: number;
    };
};

function validateMaiDimensions(
    width: number,
    height: number,
    route: MaiRoute,
): void {
    if (width < AZURE_MAI_MIN_SIDE || height < AZURE_MAI_MIN_SIDE) {
        throw UpstreamError.fromProvider(400, {
            message: `${route.title} requires width and height of at least ${AZURE_MAI_MIN_SIDE}px`,
        });
    }
    if (
        width % AZURE_MAI_DIMENSION_STEP !== 0 ||
        height % AZURE_MAI_DIMENSION_STEP !== 0
    ) {
        throw UpstreamError.fromProvider(400, {
            message: `${route.title} requires width and height to be multiples of ${AZURE_MAI_DIMENSION_STEP}px`,
        });
    }
    if (width * height > route.maxPixels) {
        throw UpstreamError.fromProvider(400, {
            message: `${route.title} supports at most ${route.maxPixels.toLocaleString("en-US")} pixels (width × height)`,
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
    route: MaiRoute,
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
    formData.append("model", route.deployment);
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
    const route = MAI_ROUTES[safeParams.model as keyof typeof MAI_ROUTES];
    if (!route) {
        throw new Error(`Unknown Azure MAI image route: ${safeParams.model}`);
    }
    if (safeParams.transparent) {
        throw UpstreamError.fromProvider(400, {
            message: `Transparent backgrounds are not supported by ${safeParams.model}.`,
        });
    }
    if (safeParams.image.length > 1) {
        throw UpstreamError.fromProvider(400, {
            message: `${route.title} supports at most 1 reference image`,
        });
    }
    const isEdit = safeParams.image.length === 1;
    if (!isEdit) {
        validateMaiDimensions(safeParams.width, safeParams.height, route);
    }

    const apiKey = getImageEnv(route.key);
    if (!apiKey) {
        throw new Error(`${route.key} not found in environment variables`);
    }

    await requireSafePrompt(prompt, safeParams, userInfo);

    const endpoint = `${route.endpoint}/${isEdit ? "edits" : "generations"}`;
    const headers: Record<string, string> = { "api-key": apiKey };
    let body: BodyInit;
    if (isEdit) {
        body = await editFormData(prompt, safeParams, userInfo, route);
    } else {
        headers["Content-Type"] = "application/json";
        // Only these fields are accepted; seed, quality and guidance are 400s.
        body = JSON.stringify({
            model: route.deployment,
            prompt: sanitizeString(prompt),
            width: safeParams.width,
            height: safeParams.height,
        });
    }

    logCloudflare(
        `Calling Azure ${route.title} in ${isEdit ? "edit" : "generation"} mode`,
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
            message: `Azure ${route.title} returned no image`,
            requestUrl: new URL(endpoint),
            upstreamStatus: response.status,
            responseBody: responseSummary,
            upstreamHeaders: collectUpstreamHeaders(response.headers),
        });
    }

    const completionImageTokens = tokenCount(data.usage?.num_output_tokens);
    if (completionImageTokens === 0) {
        throw new UpstreamError(502, {
            message: `Azure ${route.title} returned no billing metadata`,
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
