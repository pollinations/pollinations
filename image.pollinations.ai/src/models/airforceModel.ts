import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:airforce:ops");
const logError = debug("pollinations:airforce:error");

const AIRFORCE_API_URL = "https://api.airforce/v1/images/generations";

/**
 * Calls the api.airforce image/video generation API
 * Uses OpenAI-compatible /v1/images/generations endpoint
 */
export async function callAirforceAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<ImageGenerationResult> {
    logOps(`Calling api.airforce model ${airforceModel} with prompt:`, prompt);

    const apiKey = process.env.AIRFORCE_API_KEY;
    if (!apiKey) {
        throw new HttpError(
            "AIRFORCE_API_KEY environment variable is required",
            500,
        );
    }

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Generating with ${airforceModel}...`,
    );

    const requestBody = buildRequestBody(prompt, safeParams, airforceModel);
    logOps("Request body:", JSON.stringify(requestBody));

    const response = await makeApiRequest(apiKey, requestBody);

    if (!response.ok) {
        await handleApiError(response, airforceModel);
    }

    const resultBuffer = await processApiResponse(
        response,
        airforceModel,
        progress,
        requestId,
    );

    progress.updateBar(
        requestId,
        90,
        "Success",
        `${airforceModel} generation completed`,
    );

    return {
        buffer: resultBuffer,
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

function buildRequestBody(
    prompt: string,
    safeParams: ImageParams,
    airforceModel: string,
): Record<string, unknown> {
    const requestBody: Record<string, unknown> = {
        model: airforceModel,
        prompt,
        n: 1,
    };

    if (safeParams.width && safeParams.height) {
        requestBody.size = `${safeParams.width}x${safeParams.height}`;
    }

    return requestBody;
}

async function makeApiRequest(
    apiKey: string,
    requestBody: Record<string, unknown>,
): Promise<Response> {
    return fetch(AIRFORCE_API_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
    });
}

async function handleApiError(
    response: Response,
    airforceModel: string,
): Promise<never> {
    const errorText = await response.text();
    logError(
        `api.airforce ${airforceModel} request failed, status:`,
        response.status,
        "response:",
        errorText,
    );
    throw new HttpError(
        `api.airforce ${airforceModel} request failed: ${errorText}`,
        response.status,
    );
}

async function processApiResponse(
    response: Response,
    airforceModel: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
    const data = (await response.json()) as {
        data?: Array<{ url?: string; b64_json?: string }>;
    };
    logOps("api.airforce response received");

    const result = data.data?.[0];
    if (!result) {
        throw new HttpError(
            `Invalid response from api.airforce ${airforceModel}`,
            500,
        );
    }

    if (result.b64_json) {
        return Buffer.from(result.b64_json, "base64");
    }

    if (result.url) {
        return downloadResultFromUrl(result.url, progress, requestId);
    }

    throw new HttpError(`api.airforce ${airforceModel} returned no data`, 500);
}

async function downloadResultFromUrl(
    url: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
    logOps("Downloading result from URL:", url);
    progress.updateBar(requestId, 70, "Processing", "Downloading result...");

    const response = await fetch(url);

    if (!response.ok) {
        throw new HttpError(
            `Failed to download from ${url}: ${response.status}`,
            500,
        );
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    logOps("Result buffer size:", buffer.length);
    return buffer;
}

/**
 * Calls the api.airforce video generation API
 * Returns VideoGenerationResult for the video pipeline
 */
export async function callAirforceVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<VideoGenerationResult> {
    const imageResult = await callAirforceAPI(
        prompt,
        safeParams,
        progress,
        requestId,
        airforceModel,
    );

    const durationSeconds = safeParams.duration || 5;

    return {
        buffer: imageResult.buffer,
        mimeType: "video/mp4",
        durationSeconds,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                completionVideoSeconds: durationSeconds,
                totalTokenCount: 1,
            },
        },
    };
}
