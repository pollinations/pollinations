import debug from "debug";
import type {
    AuthResult,
    ImageGenerationResult,
} from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import {
    analyzeImageSafety,
    requireSafePrompt,
} from "../utils/azureContentSafety.ts";
import {
    base64ToBuffer,
    bufferToUint8Array,
    downloadUserImage,
} from "../utils/imageDownload.ts";

const logCloudflare = debug("pollinations:cloudflare");

const AZURE_MAI_ENDPOINT =
    "https://myceli-prod-eastus.services.ai.azure.com/mai/v1/images";
const AZURE_MAI_DEPLOYMENT = "MAI-Image-2.5-Flash";

type AzureMaiUsage = {
    num_input_text_tokens?: number;
    num_input_image_tokens?: number;
    num_output_tokens?: number;
};

type AzureMaiResponse = {
    data?: Array<{ b64_json?: string }>;
    usage?: AzureMaiUsage;
};

function safeTokenCount(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function mapAzureMaiUsage(usage: AzureMaiUsage | undefined) {
    const promptTextTokens = safeTokenCount(usage?.num_input_text_tokens);
    const promptImageTokens = safeTokenCount(usage?.num_input_image_tokens);
    const completionImageTokens = safeTokenCount(usage?.num_output_tokens);

    return {
        promptTextTokens,
        promptImageTokens,
        completionImageTokens,
        totalTokenCount:
            promptTextTokens + promptImageTokens + completionImageTokens,
    };
}

async function createEditRequest(
    prompt: string,
    imageUrls: string[],
): Promise<FormData> {
    if (imageUrls.length !== 1) {
        throw new HttpError(
            `MAI image editing requires exactly one reference image (received ${imageUrls.length}).`,
            400,
            { validation: true },
        );
    }

    const { buffer, mimeType } = await downloadUserImage(imageUrls[0]);
    if (mimeType !== "image/jpeg" && mimeType !== "image/png") {
        throw new HttpError(
            "MAI image editing accepts JPEG or PNG reference images only.",
            400,
            { validation: true },
        );
    }

    const imageSafety = await analyzeImageSafety(buffer);
    if (!imageSafety.safe) {
        throw new HttpError(
            `Input image contains unsafe content: ${imageSafety.formattedViolations}`,
            400,
        );
    }

    const formData = new FormData();
    formData.append("model", AZURE_MAI_DEPLOYMENT);
    formData.append("prompt", sanitizeString(prompt));
    formData.append(
        "image",
        new Blob([bufferToUint8Array(buffer)], { type: mimeType }),
        mimeType === "image/png" ? "image.png" : "image.jpg",
    );
    return formData;
}

export async function callAzureMaiImage(
    prompt: string,
    safeParams: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    const apiKey = getImageEnv("AZURE_MYCELI_PROD_API_KEY");
    if (!apiKey) {
        throw new Error(
            "AZURE_MYCELI_PROD_API_KEY not found in environment variables",
        );
    }

    await requireSafePrompt(prompt, safeParams, userInfo);

    const isEdit = safeParams.image.length > 0;
    const endpoint = `${AZURE_MAI_ENDPOINT}/${isEdit ? "edits" : "generations"}`;
    const body = isEdit
        ? await createEditRequest(prompt, safeParams.image)
        : JSON.stringify({
              model: AZURE_MAI_DEPLOYMENT,
              prompt: sanitizeString(prompt),
              width: safeParams.width,
              height: safeParams.height,
          });

    const response = await fetch(endpoint, {
        method: "POST",
        headers: {
            "api-key": apiKey,
            ...(!isEdit && { "Content-Type": "application/json" }),
        },
        body,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new HttpError(errorText, response.status, undefined, endpoint);
    }

    const data = (await response.json()) as AzureMaiResponse;
    const base64Image = data.data?.[0]?.b64_json;
    if (!base64Image) {
        throw new HttpError(
            "Invalid response from Azure MAI image API",
            502,
            undefined,
            endpoint,
        );
    }

    const usage = mapAzureMaiUsage(data.usage);
    logCloudflare("Azure MAI image usage:", data.usage);

    return {
        buffer: base64ToBuffer(base64Image),
        isMature: false,
        isChild: false,
        trackingData: {
            actualModel: safeParams.model,
            usage,
        },
    };
}
