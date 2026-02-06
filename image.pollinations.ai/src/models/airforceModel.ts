import debug from "debug";
import type { ImageGenerationResult } from "../createAndReturnImages.ts";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { withTimeoutSignal } from "../util.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:airforce:ops");
const logError = debug("pollinations:airforce:error");

const AIRFORCE_API_URL = "https://api.airforce/v1/images/generations";

/**
 * Calls the api.airforce image/video generation API
 * Uses OpenAI-compatible /v1/images/generations endpoint
 * Supports models: imagen-3, imagen-4, grok-imagine-video, etc.
 */
export const callAirforceAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<ImageGenerationResult> => {
    try {
        logOps(
            `Calling api.airforce model ${airforceModel} with prompt:`,
            prompt,
        );

        const apiKey = process.env.AIRFORCE_API_KEY;
        if (!apiKey) {
            throw new Error(
                "AIRFORCE_API_KEY environment variable is required",
            );
        }

        progress.updateBar(
            requestId,
            35,
            "Processing",
            `Generating with ${airforceModel}...`,
        );

        const requestBody: Record<string, unknown> = {
            model: airforceModel,
            prompt: prompt,
            n: 1,
        };

        if (safeParams.width && safeParams.height) {
            requestBody.size = `${safeParams.width}x${safeParams.height}`;
        }

        logOps("Request body:", JSON.stringify(requestBody));

        const response = await withTimeoutSignal(
            (signal) =>
                fetch(AIRFORCE_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify(requestBody),
                    signal,
                }),
            180000, // 3 minute timeout (video can be slow)
        );

        if (!response.ok) {
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

        const data = (await response.json()) as {
            data?: Array<{ url?: string; b64_json?: string }>;
        };
        logOps("api.airforce response received");

        if (!data.data || !data.data[0]) {
            throw new Error(
                `Invalid response from api.airforce ${airforceModel}`,
            );
        }

        const result = data.data[0];

        let resultBuffer: Buffer;

        if (result.b64_json) {
            resultBuffer = Buffer.from(result.b64_json, "base64");
        } else if (result.url) {
            logOps("Downloading result from URL:", result.url);
            progress.updateBar(
                requestId,
                70,
                "Processing",
                "Downloading result...",
            );

            const downloadResponse = await withTimeoutSignal(
                (signal) => fetch(result.url, { signal }),
                60000,
            );

            if (!downloadResponse.ok) {
                throw new Error(
                    `Failed to download from ${result.url}: ${downloadResponse.status}`,
                );
            }

            resultBuffer = Buffer.from(await downloadResponse.arrayBuffer());
        } else {
            throw new Error(`api.airforce ${airforceModel} returned no data`);
        }

        logOps("Result buffer size:", resultBuffer.length);

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
    } catch (error) {
        logError(`Error calling api.airforce ${airforceModel}:`, error);
        if (error instanceof HttpError) {
            throw error;
        }
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(
            `api.airforce ${airforceModel} generation failed: ${message}`,
        );
    }
};

/**
 * Calls the api.airforce video generation API
 * Returns VideoGenerationResult for the video pipeline
 */
export const callAirforceVideoAPI = async (
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
    airforceModel: string,
): Promise<VideoGenerationResult> => {
    // Reuse the core API call logic
    const imageResult = await callAirforceAPI(
        prompt,
        safeParams,
        progress,
        requestId,
        airforceModel,
    );

    return {
        buffer: imageResult.buffer,
        mimeType: "video/mp4",
        durationSeconds: safeParams.duration || 5,
        trackingData: {
            actualModel: safeParams.model,
            usage: {
                completionVideoSeconds: safeParams.duration || 5,
                totalTokenCount: 1,
            },
        },
    };
};
