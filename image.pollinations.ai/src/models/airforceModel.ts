import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:airforce:ops");
const logError = debug("pollinations:airforce:error");

const AIRFORCE_API_URL = "https://api.airforce/v1/images/generations";

const VIDEO_MODELS = ["grok-imagine-video"];

// api.airforce only supports these exact sizes (OpenAI DALL-E 3 compatible)
const SUPPORTED_SIZES: Array<{ width: number; height: number }> = [
    { width: 1024, height: 1024 }, // 1:1
    { width: 1024, height: 1792 }, // ~9:16 portrait
    { width: 1792, height: 1024 }, // ~16:9 landscape
];

/**
 * Pick the supported size closest to the requested aspect ratio.
 * If no size is requested, returns undefined (let the API use its default).
 */
function closestSupportedSize(
    width: number | undefined,
    height: number | undefined,
): string | undefined {
    if (!width || !height) return undefined;

    const requestedRatio = width / height;
    let best = SUPPORTED_SIZES[0];
    let bestDiff = Math.abs(requestedRatio - best.width / best.height);

    for (const size of SUPPORTED_SIZES) {
        const diff = Math.abs(requestedRatio - size.width / size.height);
        if (diff < bestDiff) {
            best = size;
            bestDiff = diff;
        }
    }

    logOps(
        `Mapped requested ${width}x${height} (ratio ${requestedRatio.toFixed(2)}) → ${best.width}x${best.height}`,
    );
    return `${best.width}x${best.height}`;
}

/**
 * Generic api.airforce call — returns the raw result buffer.
 */
async function fetchFromAirforce(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<Buffer> {
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

    const isVideo = VIDEO_MODELS.includes(airforceModel);
    const response = await makeApiRequest(apiKey, requestBody);

    if (!response.ok) {
        await handleApiError(response, airforceModel);
    }

    const resultBuffer = isVideo
        ? await processSseResponse(response, airforceModel, progress, requestId)
        : await processApiResponse(
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

    return resultBuffer;
}

/**
 * Image generation via api.airforce (e.g. imagen-4, flux-2-dev)
 */
export async function callAirforceImageAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<ImageGenerationResult> {
    const buffer = await fetchFromAirforce(
        prompt,
        safeParams,
        progress,
        requestId,
        airforceModel,
    );

    return {
        buffer,
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

    if (VIDEO_MODELS.includes(airforceModel)) {
        requestBody.sse = true;
        requestBody.response_format = "url";
    } else if (airforceModel === "imagen-4") {
        const size = closestSupportedSize(safeParams.width, safeParams.height);
        if (size) requestBody.size = size;
    } else if (safeParams.width && safeParams.height) {
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

async function processSseResponse(
    response: Response,
    airforceModel: string,
    progress: ProgressManager,
    requestId: string,
): Promise<Buffer> {
    const text = await response.text();
    logOps("SSE response received, parsing...");

    let resultUrl: string | undefined;

    for (const line of text.split("\n")) {
        const trimmed = line.trim();
        if (
            !trimmed.startsWith("data: ") ||
            trimmed === "data: [DONE]" ||
            trimmed === "data: : keepalive"
        ) {
            continue;
        }
        try {
            const parsed = JSON.parse(trimmed.slice(6)) as {
                data?: Array<{ url?: string }>;
                error?: string;
            };
            if (parsed.error) {
                throw new HttpError(
                    `api.airforce ${airforceModel} error: ${parsed.error}`,
                    500,
                );
            }
            const url = parsed.data?.[0]?.url;
            if (url) {
                resultUrl = url;
            }
        } catch (e) {
            if (e instanceof HttpError) throw e;
            logError("Failed to parse SSE line:", trimmed);
        }
    }

    if (!resultUrl) {
        throw new HttpError(
            `api.airforce ${airforceModel} SSE returned no result URL`,
            500,
        );
    }

    logOps("SSE result URL:", resultUrl);
    return downloadResultFromUrl(resultUrl, progress, requestId);
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

const MAX_VIDEO_RETRIES = 3;

/**
 * Video generation via api.airforce (e.g. grok-imagine-video)
 * Includes retry logic since video models can be flaky.
 */
export async function callAirforceVideoAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<VideoGenerationResult> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_VIDEO_RETRIES; attempt++) {
        try {
            if (attempt > 1) {
                logOps(
                    `Retry ${attempt}/${MAX_VIDEO_RETRIES} for ${airforceModel}`,
                );
                progress.updateBar(
                    requestId,
                    20,
                    "Retrying",
                    `Attempt ${attempt}/${MAX_VIDEO_RETRIES}...`,
                );
            }

            const buffer = await fetchFromAirforce(
                prompt,
                safeParams,
                progress,
                requestId,
                airforceModel,
            );

            const durationSeconds = safeParams.duration || 5;

            return {
                buffer,
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
        } catch (error) {
            lastError = error as Error;
            logError(
                `${airforceModel} attempt ${attempt}/${MAX_VIDEO_RETRIES} failed:`,
                lastError.message,
            );
        }
    }

    throw (
        lastError ||
        new HttpError(
            `${airforceModel} failed after ${MAX_VIDEO_RETRIES} retries`,
            500,
        )
    );
}
