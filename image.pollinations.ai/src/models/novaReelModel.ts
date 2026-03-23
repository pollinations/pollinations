import debug from "debug";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { sleep } from "../util.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";
import type { VideoGenerationResult } from "./veoVideoModel.ts";

const logOps = debug("pollinations:nova-reel:ops");
const logError = debug("pollinations:nova-reel:error");

/**
 * Generate a video using Amazon Nova Reel via Bedrock async invocation
 *
 * Flow: StartAsyncInvoke → poll GetAsyncInvoke → download from S3
 */
export async function callNovaReelAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<VideoGenerationResult> {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";
    const s3Bucket = process.env.NOVA_REEL_S3_BUCKET;

    if (!accessKeyId || !secretAccessKey) {
        throw new HttpError("AWS credentials not configured", 500);
    }
    if (!s3Bucket) {
        throw new HttpError(
            "NOVA_REEL_S3_BUCKET environment variable is required",
            500,
        );
    }

    // Duration must be a multiple of 6, max 30s. Default 6s.
    const requestedDuration = safeParams.duration || 6;
    const durationSeconds = Math.min(
        30,
        Math.max(6, Math.round(requestedDuration / 6) * 6),
    );
    const imageParam = safeParams.image as string | string[] | undefined;
    const hasImage = imageParam && imageParam.length > 0;

    logOps("Calling Nova Reel API:", {
        prompt: prompt.substring(0, 100),
        durationSeconds,
        hasImage,
    });

    progress.updateBar(
        requestId,
        35,
        "Processing",
        "Starting video generation with Nova Reel...",
    );

    const {
        BedrockRuntimeClient,
        StartAsyncInvokeCommand,
        GetAsyncInvokeCommand,
    } = await import("@aws-sdk/client-bedrock-runtime");

    const bedrockClient = new BedrockRuntimeClient({
        region,
        credentials: { accessKeyId, secretAccessKey },
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
        logOps("Adding reference image for I2V:", imageUrl);
        progress.updateBar(
            requestId,
            38,
            "Processing",
            "Processing reference image...",
        );
        const { base64 } = await downloadImageAsBase64(imageUrl);
        textToVideoParams.images = [
            {
                format: "png",
                source: { bytes: base64 },
            },
        ];
    }

    // Use MULTI_SHOT_AUTOMATED for >6s, TEXT_VIDEO for 6s
    const taskType =
        durationSeconds > 6 ? "MULTI_SHOT_AUTOMATED" : "TEXT_VIDEO";
    const requestBody = {
        taskType,
        textToVideoParams,
        videoGenerationConfig: {
            durationSeconds,
            fps: 24,
            dimension: "1280x720",
        },
    };

    const s3OutputPrefix = `s3://${s3Bucket}/nova-reel/${requestId}/`;

    const startCommand = new StartAsyncInvokeCommand({
        modelId: "amazon.nova-reel-v1:1",
        modelInput: requestBody,
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
            throw new HttpError("No invocation ARN returned", 500);
        }
        invocationArn = startResponse.invocationArn;
        logOps("Nova Reel async invocation started:", invocationArn);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logError("Nova Reel StartAsyncInvoke failed:", message);
        throw new HttpError(
            `Nova Reel video generation failed to start: ${message}`,
            500,
        );
    }

    // Poll for completion
    progress.updateBar(
        requestId,
        50,
        "Processing",
        "Generating video (this takes ~90 seconds)...",
    );

    const maxAttempts = 60; // 5 minutes max
    let delayMs = 5000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        logOps(`Poll attempt ${attempt}/${maxAttempts}...`);

        const progressPercent = 50 + Math.min(40, attempt);
        progress.updateBar(
            requestId,
            progressPercent,
            "Processing",
            `Waiting for video... (${attempt}/${maxAttempts})`,
        );

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
                    throw new HttpError("No S3 output URI in response", 500);
                }

                logOps("Downloading video from S3:", s3OutputUri);
                progress.updateBar(
                    requestId,
                    92,
                    "Processing",
                    "Downloading generated video...",
                );

                const videoBuffer = await downloadFromS3(
                    s3OutputUri,
                    region,
                    accessKeyId,
                    secretAccessKey,
                );

                progress.updateBar(
                    requestId,
                    95,
                    "Success",
                    "Video generation completed",
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
                throw new HttpError(
                    `Nova Reel video generation failed: ${failureMessage}`,
                    500,
                );
            }

            // Still in progress
            await sleep(delayMs);
            delayMs = Math.min(delayMs * 1.1, 15000);
        } catch (error) {
            if (error instanceof HttpError) throw error;
            logError("Poll error:", error);
            await sleep(delayMs);
        }
    }

    throw new HttpError(
        "Nova Reel video generation timed out after 5 minutes",
        504,
    );
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

    // Parse s3://bucket/key format
    const match = s3Uri.match(/^s3:\/\/([^/]+)\/(.+)$/);
    if (!match) {
        throw new HttpError(`Invalid S3 URI: ${s3Uri}`, 500);
    }

    const bucket = match[1];
    // Nova Reel puts the video at output.mp4 under the prefix
    const keyPrefix = match[2].replace(/\/$/, "");
    const key = `${keyPrefix}/output.mp4`;

    const s3Client = new S3Client({
        region,
        credentials: { accessKeyId, secretAccessKey },
    });

    const getCommand = new GetObjectCommand({ Bucket: bucket, Key: key });
    const response = await s3Client.send(getCommand);

    if (!response.Body) {
        throw new HttpError("Empty S3 response body", 500);
    }

    // Convert stream to buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks);
}
