import { UpstreamError } from "@shared/error.ts";
import debug from "debug";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sleep } from "../util.ts";
import { downloadUserImage } from "../utils/imageDownload.ts";
import { transformImage } from "../utils/imageTransform.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:nova-reel:ops");
const logError = debug("pollinations:nova-reel:error");

const SINGLE_SHOT_PROMPT_LIMIT = 512;
const MULTI_SHOT_PROMPT_LIMIT = 4000;
const NOVA_REEL_WIDTH = 1280;
const NOVA_REEL_HEIGHT = 720;

function getNovaReelDurationSeconds(duration?: number): number {
    const requestedDuration = duration || 6;
    return Math.min(120, Math.max(6, Math.round(requestedDuration / 6) * 6));
}

function getNovaReelInputErrorStatus(message: string): number {
    const normalized = message.toLowerCase();
    if (
        normalized.includes("content filter") ||
        normalized.includes("maxlength") ||
        normalized.includes("provided image") ||
        normalized.includes("detected file mime type") ||
        normalized.includes("validation") ||
        normalized.includes("must have dimensions")
    ) {
        return 400;
    }
    if (
        normalized.includes("rate limit") ||
        normalized.includes("capacity limit")
    ) {
        return 429;
    }
    return 500;
}

function validateNovaReelRequest({
    prompt,
    duration,
    image,
}: {
    prompt: string;
    duration?: number;
    image?: string | string[];
}): void {
    const durationSeconds = getNovaReelDurationSeconds(duration);
    const hasImage = Boolean(image && image.length > 0);
    const isMultiShot = durationSeconds > 6;

    if (hasImage && isMultiShot) {
        throw UpstreamError.fromProvider(400, {
            message:
                "Nova Reel reference images are only supported for 6 second videos.",
        });
    }

    const promptLimit = isMultiShot
        ? MULTI_SHOT_PROMPT_LIMIT
        : SINGLE_SHOT_PROMPT_LIMIT;
    if (prompt.length > promptLimit) {
        throw UpstreamError.fromProvider(400, {
            message: `Nova Reel prompt too long: ${prompt.length} characters. Maximum is ${promptLimit}.`,
        });
    }
}

async function normalizeReferenceImage(imageUrl: string): Promise<Buffer> {
    const { buffer, mimeType } = await downloadUserImage(imageUrl);
    logOps("Normalizing reference image for Nova Reel:", { mimeType });

    try {
        return await transformImage(buffer, {
            format: "image/png",
            width: NOVA_REEL_WIDTH,
            height: NOVA_REEL_HEIGHT,
            fit: "cover",
        });
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw UpstreamError.fromProvider(400, {
            message: `Failed to process reference image: ${message}`,
        });
    }
}

/**
 * Generate a video using Amazon Nova Reel via Bedrock async invocation
 *
 * Flow: StartAsyncInvoke → poll GetAsyncInvoke → download from S3
 */
export async function callNovaReelAPI(
    prompt: string,
    safeParams: ImageParams,
    requestId: string,
): Promise<VideoGenerationResult> {
    // Duration must be a multiple of 6. TEXT_VIDEO = 6s only. MULTI_SHOT_AUTOMATED = 12-120s.
    const durationSeconds = getNovaReelDurationSeconds(safeParams.duration);
    const imageParam = safeParams.image as string | string[] | undefined;
    const hasImage = Boolean(imageParam && imageParam.length > 0);
    const isMultiShot = durationSeconds > 6;

    validateNovaReelRequest({
        prompt,
        duration: safeParams.duration,
        image: imageParam,
    });

    const accessKeyId = getImageEnv("AWS_ACCESS_KEY_ID");
    const secretAccessKey = getImageEnv("AWS_SECRET_ACCESS_KEY");
    const region = getImageEnv("AWS_REGION") || "us-east-1";
    const s3Bucket = getImageEnv("NOVA_REEL_S3_BUCKET");

    if (!accessKeyId || !secretAccessKey) {
        throw UpstreamError.fromProvider(500, {
            message: "AWS credentials not configured",
        });
    }
    if (!s3Bucket) {
        throw UpstreamError.fromProvider(500, {
            message: "NOVA_REEL_S3_BUCKET environment variable is required",
        });
    }

    logOps("Calling Nova Reel API:", {
        prompt: prompt.substring(0, 100),
        durationSeconds,
        hasImage,
    });

    const {
        BedrockRuntimeClient,
        StartAsyncInvokeCommand,
        GetAsyncInvokeCommand,
    } = await import("@aws-sdk/client-bedrock-runtime");
    const { FetchHttpHandler } = await import("@smithy/fetch-http-handler");

    const bedrockClient = new BedrockRuntimeClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
        requestHandler: new FetchHttpHandler(),
    });

    // Build request body
    const textToVideoParams: {
        text: string;
        images?: Array<{ format: string; source: { bytes: string } }>;
    } = {
        text: prompt,
    };

    // Support image-to-video if an input image is provided
    if (hasImage) {
        const imageUrl = Array.isArray(imageParam) ? imageParam[0] : imageParam;
        if (!imageUrl) {
            throw UpstreamError.fromProvider(400, {
                message: "Nova Reel reference image is missing",
            });
        }
        logOps("Adding reference image for I2V:", imageUrl);
        const buffer = await normalizeReferenceImage(imageUrl);
        textToVideoParams.images = [
            {
                format: "png",
                source: { bytes: buffer.toString("base64") },
            },
        ];
    }

    // TEXT_VIDEO for 6s single-shot, MULTI_SHOT_AUTOMATED for 12-120s multi-shot
    const requestBody = isMultiShot
        ? {
              taskType: "MULTI_SHOT_AUTOMATED" as const,
              multiShotAutomatedParams: { text: prompt },
              videoGenerationConfig: {
                  durationSeconds,
                  fps: 24,
                  dimension: "1280x720",
                  seed: safeParams.seed,
              },
          }
        : {
              taskType: "TEXT_VIDEO" as const,
              textToVideoParams,
              videoGenerationConfig: {
                  durationSeconds,
                  fps: 24,
                  dimension: "1280x720",
                  seed: safeParams.seed,
              },
          };

    const s3OutputPrefix = `s3://${s3Bucket}/nova-reel/${requestId}/`;

    const startCommand = new StartAsyncInvokeCommand({
        modelId: "amazon.nova-reel-v1:1",
        modelInput: requestBody as any,
        outputDataConfig: {
            s3OutputDataConfig: {
                s3Uri: s3OutputPrefix,
            },
        },
    });

    let invocationArn: string;
    try {
        const startResponse = await bedrockClient.send(startCommand);
        if (!startResponse.invocationArn) {
            throw UpstreamError.fromProvider(500, {
                message: "No invocation ARN returned",
            });
        }
        invocationArn = startResponse.invocationArn;
        logOps("Nova Reel async invocation started:", invocationArn);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError("Nova Reel StartAsyncInvoke failed:", message);
        throw UpstreamError.fromProvider(getNovaReelInputErrorStatus(message), {
            message: `Nova Reel video generation failed to start: ${message}`,
        });
    }

    // Poll for completion

    const maxAttempts = 60; // 5 minutes max
    let delayMs = 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(`Poll attempt ${attempt}/${maxAttempts}...`);

        const getCommand = new GetAsyncInvokeCommand({
            invocationArn,
        });

        try {
            const pollResponse = await bedrockClient.send(getCommand);
            const status = pollResponse.status;
            logOps("Poll status:", status);

            if (status === "Completed") {
                // Download the video from S3
                const s3OutputUri =
                    pollResponse.outputDataConfig?.s3OutputDataConfig?.s3Uri;
                if (!s3OutputUri) {
                    throw UpstreamError.fromProvider(500, {
                        message: "No S3 output URI in response",
                    });
                }

                logOps("Downloading video from S3:", s3OutputUri);

                const videoBuffer = await downloadFromS3(
                    s3OutputUri,
                    region,
                    accessKeyId,
                    secretAccessKey,
                );

                return {
                    buffer: videoBuffer,
                    mimeType: "video/mp4",
                    durationSeconds,
                    trackingData: {
                        actualModel: "nova-reel",
                        usage: {
                            completionVideoSeconds: durationSeconds,
                        },
                    },
                };
            }

            if (status === "Failed") {
                const failureMessage =
                    pollResponse.failureMessage || "Unknown error";
                logError("Nova Reel generation failed:", failureMessage);
                throw UpstreamError.fromProvider(
                    getNovaReelInputErrorStatus(failureMessage),
                    {
                        message: `Nova Reel video generation failed: ${failureMessage}`,
                    },
                );
            }

            // Still in progress
            await sleep(delayMs);
            delayMs = Math.min(delayMs * 1.1, 15000);
        } catch (error) {
            if (error instanceof UpstreamError) throw error;
            logError("Poll error:", error);
            await sleep(delayMs);
        }
    }

    throw UpstreamError.fromProvider(504, {
        message: "Nova Reel video generation timed out after 5 minutes",
    });
}

/**
 * Download the output video from S3
 * Nova Reel writes output.mp4 under the S3 prefix
 */
async function downloadFromS3(
    s3Uri: string,
    region: string,
    accessKeyId: string,
    secretAccessKey: string,
): Promise<Buffer> {
    const { S3Client, GetObjectCommand } = await import("@aws-sdk/client-s3");
    const { FetchHttpHandler } = await import("@smithy/fetch-http-handler");

    // Parse s3://bucket/key format
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
        throw UpstreamError.fromProvider(500, {
            message: `Invalid S3 URI: ${s3Uri}`,
        });
    }

    const bucket = match[1];
    // Nova Reel puts the video at output.mp4 under the prefix
    const keyPrefix = match[2].replace(/\/$/, "");
    const key = `${keyPrefix}/output.mp4`;

    const s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
        requestHandler: new FetchHttpHandler(),
    });

    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getCommand);

    if (!response.Body) {
        throw UpstreamError.fromProvider(500, {
            message: "Empty S3 response body",
        });
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
