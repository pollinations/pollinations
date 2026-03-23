import debug from "debug";
import { HttpError } from "../httpError.ts";
import type { ImageParams } from "../params.ts";
import type { ProgressManager } from "../progressBar.ts";
import { downloadImageAsBase64 } from "../utils/imageDownload.ts";

const logOps = debug("pollinations:nova-canvas:ops");
const logError = debug("pollinations:nova-canvas:error");

interface NovaCanvasResponse {
    images?: string[]; // base64-encoded images
    error?: string;
}

/**
 * Result type matching other image model handlers
 */
interface ImageGenerationResult {
    buffer: Buffer;
    isMature: boolean;
    isChild: boolean;
    trackingData: {
        actualModel: string;
        usage: {
            completionImageTokens: number;
            totalTokenCount: number;
        };
    };
}

/**
 * Clamp and align dimensions to Nova Canvas constraints:
 * - 320-4096px per side, divisible by 16
 * - Total pixels < 4,194,304
 */
function clampDimensions(
    width: number,
    height: number,
): { width: number; height: number } {
    const clamp = (v: number) =>
        Math.round(Math.max(320, Math.min(4096, v)) / 16) * 16;
    let w = clamp(width);
    let h = clamp(height);

    const maxPixels = 4_194_304;
    if (w * h > maxPixels) {
        const scale = Math.sqrt(maxPixels / (w * h));
        w = Math.round((w * scale) / 16) * 16;
        h = Math.round((h * scale) / 16) * 16;
    }

    return { width: w, height: h };
}

/**
 * Generate an image using Amazon Nova Canvas via Bedrock InvokeModel
 */
export async function callNovaCanvasAPI(
    prompt: string,
    safeParams: ImageParams,
    progress: ProgressManager,
    requestId: string,
): Promise<ImageGenerationResult> {
    const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
    const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
    const region = process.env.AWS_REGION || "us-east-1";

    if (!accessKeyId || !secretAccessKey) {
        throw new HttpError("AWS credentials not configured", 500);
    }

    const { width, height } = clampDimensions(
        safeParams.width || 1024,
        safeParams.height || 1024,
    );

    // Check if image input is provided for editing mode
    const rawImageUrl = safeParams.image
        ? Array.isArray(safeParams.image)
            ? safeParams.image[0]
            : safeParams.image
        : undefined;
    const mode = rawImageUrl ? "IMAGE_VARIATION" : "TEXT_IMAGE";

    logOps(`Calling Nova Canvas API (${mode}):`, {
        prompt: prompt.substring(0, 100),
        width,
        height,
        seed: safeParams.seed,
        hasImage: !!rawImageUrl,
    });

    progress.updateBar(
        requestId,
        35,
        "Processing",
        `Generating with Nova Canvas (${mode === "IMAGE_VARIATION" ? "editing" : "text-to-image"})...`,
    );

    // Dynamic import to avoid requiring the SDK at module load time
    const { BedrockRuntimeClient, InvokeModelCommand } = await import(
        "@aws-sdk/client-bedrock-runtime"
    );

    const client = new BedrockRuntimeClient({
        region,
        credentials: {
            accessKeyId,
            secretAccessKey,
        },
    });

    const imageGenerationConfig = {
        numberOfImages: 1,
        height,
        width,
        cfgScale: 8.0,
        ...(safeParams.seed != null ? { seed: safeParams.seed } : {}),
    };

    let requestBody: Record<string, unknown>;

    if (rawImageUrl) {
        // Image variation mode - download and convert to base64
        const { base64 } = await downloadImageAsBase64(rawImageUrl);
        requestBody = {
            taskType: "IMAGE_VARIATION",
            imageVariationParams: {
                text: prompt,
                images: [base64],
                similarityStrength: 0.7,
            },
            imageGenerationConfig,
        };
    } else {
        requestBody = {
            taskType: "TEXT_IMAGE",
            textToImageParams: {
                text: prompt,
            },
            imageGenerationConfig,
        };
    }

    const command = new InvokeModelCommand({
        modelId: "amazon.nova-canvas-v1:0",
        contentType: "application/json",
        accept: "application/json",
        body: JSON.stringify(requestBody),
    });

    try {
        const response = await client.send(command);
        const responseBody: NovaCanvasResponse = JSON.parse(
            new TextDecoder().decode(response.body),
        );

        if (responseBody.error) {
            logError("Nova Canvas API error:", responseBody.error);
            throw new HttpError(
                `Nova Canvas generation failed: ${responseBody.error}`,
                400,
            );
        }

        if (!responseBody.images || responseBody.images.length === 0) {
            throw new HttpError("Nova Canvas returned no images", 500);
        }

        const imageBuffer = Buffer.from(responseBody.images[0], "base64");
        logOps(
            "Nova Canvas image received, size:",
            (imageBuffer.length / 1024).toFixed(1),
            "KB",
        );

        progress.updateBar(
            requestId,
            90,
            "Success",
            "Image generation completed",
        );

        return {
            buffer: imageBuffer,
            isMature: false,
            isChild: false,
            trackingData: {
                actualModel: "nova-canvas",
                usage: {
                    completionImageTokens: 1,
                    totalTokenCount: 1,
                },
            },
        };
    } catch (error) {
        if (error instanceof HttpError) throw error;
        const message = error instanceof Error ? error.message : String(error);
        logError("Nova Canvas API call failed:", message);
        throw new HttpError(`Nova Canvas generation failed: ${message}`, 500);
    }
}
