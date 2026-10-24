import { UpstreamError } from "@shared/error.ts";
import { createGateway } from "ai";
import type {
    AuthResult,
    ImageGenerationResult,
} from "../createAndReturnImages.ts";
import { getImageEnv } from "../env.ts";
import type { ImageParams } from "../params.ts";
import { sanitizeString } from "../util.ts";
import { base64ToBuffer } from "../utils/imageDownload.ts";
import { checkMaiInputs, validateMaiDimensions } from "./azureMaiImageModel.ts";

export async function callMaiVercelImage(
    prompt: string,
    params: ImageParams,
    userInfo: AuthResult,
): Promise<ImageGenerationResult> {
    const isEdit = params.image.length > 0;
    if (!isEdit) {
        validateMaiDimensions(params.width, params.height, "MAI Image 2.6");
    }
    const images = await checkMaiInputs(prompt, params, userInfo);
    const gateway = createGateway({
        apiKey: getImageEnv("AI_GATEWAY_API_KEY"),
    });
    const result = await Promise.resolve(
        gateway.image("microsoft/mai-image-2.6").doGenerate({
            prompt: sanitizeString(prompt),
            n: 1,
            // MAI edits determine their size from the references, as on Azure.
            size: isEdit ? undefined : `${params.width}x${params.height}`,
            aspectRatio: undefined,
            seed: undefined,
            files: images.map(({ buffer, mimeType }) => ({
                type: "file",
                data: buffer,
                mediaType: mimeType,
            })),
            mask: undefined,
            providerOptions: { gateway: { only: ["azure"] } },
        }),
    ).catch((error: { statusCode?: number; message: string }) => {
        throw UpstreamError.fromProvider(error.statusCode ?? 502, {
            message: `MAI Vercel generation failed: ${error.message}`,
        });
    });
    const metadata = result.providerMetadata?.azure?.images?.[0] as
        | { textTokens?: number; imageTokens?: number }
        | undefined;
    const promptTextTokens = metadata?.textTokens;
    const promptImageTokens = metadata?.imageTokens;
    const completionImageTokens = result.usage?.outputTokens;
    const reportedCost = (
        result.providerMetadata?.gateway as { cost?: unknown } | undefined
    )?.cost;
    const cost =
        typeof reportedCost === "string" && reportedCost.trim()
            ? Number(reportedCost)
            : reportedCost;
    if (
        typeof promptTextTokens !== "number" ||
        !Number.isFinite(promptTextTokens) ||
        promptTextTokens < 0 ||
        typeof promptImageTokens !== "number" ||
        !Number.isFinite(promptImageTokens) ||
        promptImageTokens < 0 ||
        typeof completionImageTokens !== "number" ||
        !Number.isFinite(completionImageTokens) ||
        completionImageTokens <= 0 ||
        typeof cost !== "number" ||
        !Number.isFinite(cost) ||
        cost < 0 ||
        !result.images[0]
    ) {
        throw UpstreamError.fromProvider(502, {
            message:
                "MAI Vercel response is missing image or valid billing metadata",
        });
    }
    const image = result.images[0];
    return {
        buffer:
            typeof image === "string"
                ? base64ToBuffer(image)
                : Buffer.from(image),
        trackingData: {
            actualModel: params.model,
            usage: {
                promptTextTokens,
                promptImageTokens,
                completionImageTokens,
            },
            providerBilling: { units: cost, unitCost: 1 },
        },
    };
}
