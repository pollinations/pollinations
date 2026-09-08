import { UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { withModelFallbackResponse } from "../fallback.ts";
import { bufferToUint8Array } from "../image/utils/imageDownload.ts";
import { enforceModelRateLimit } from "../utils/model-rate-limit.ts";
import {
    createAndReturnModel3d,
    type Model3dGenerationResult,
} from "./createAndReturnModel3d.ts";
import { syncModel3dEnvironment } from "./env.ts";
import { type Model3dParams, Model3dParamsSchema } from "./params.ts";

type Model3dContext = Context<Env>;

export async function generate3dResponse(
    c: Model3dContext,
    prompt: string,
    body: Record<string, unknown> = {},
): Promise<Response> {
    syncModel3dEnvironment(c.env);
    const originalPrompt = decodePrompt(prompt || "");
    const safeParams = parseModel3dParams(c, body);
    c.var.track.setPricingInput({ resolution: safeParams.resolution });

    try {
        return await withModelFallbackResponse(
            c.var.model,
            async (candidate) => {
                const params = { ...safeParams, model: candidate.id };
                const result = await createAndReturnModel3d(
                    originalPrompt,
                    params,
                );
                assertNonEmptyMedia(result);
                return new Response(bufferToUint8Array(result.buffer), {
                    headers: mediaHeaders(originalPrompt, params, result),
                });
            },
            c.var.track?.attempts,
            (candidate) => enforceModelRateLimit(c, candidate),
        );
    } catch (error) {
        throw3dError(error);
    }
}

export async function handle3dPrompt(
    c: Model3dContext,
    prompt: string,
): Promise<Response> {
    const body =
        c.req.method === "POST"
            ? (c.req.valid("json" as never) as Record<string, unknown>)
            : {};
    return generate3dResponse(c, prompt, body);
}

export function decodePrompt(rawPrompt: string): string {
    try {
        return decodeURIComponent(rawPrompt);
    } catch {
        return rawPrompt;
    }
}

export function parseModel3dParams(
    c: Model3dContext,
    body: Record<string, unknown>,
): Model3dParams {
    const queryParams = Object.fromEntries(new URL(c.req.url).searchParams);
    const mergedParams = {
        resolution: "low",
        ...queryParams,
        ...body,
        model: c.var.model.resolved,
    };
    delete (mergedParams as Record<string, unknown>).prompt;
    delete (mergedParams as Record<string, unknown>).key;

    const parseResult = Model3dParamsSchema.safeParse(mergedParams);
    if (!parseResult.success) {
        throw new UpstreamError(400, {
            message: `Invalid parameters: ${parseResult.error.issues[0]?.message || "validation failed"}`,
            cause: parseResult.error.issues,
        });
    }
    return parseResult.data;
}

export function assertNonEmptyMedia(result: Model3dGenerationResult): void {
    if (!result.buffer || result.buffer.length === 0) {
        throw UpstreamError.fromProvider(502, {
            message: "3D provider returned an empty response",
        });
    }
}

function contentDisposition(prompt: string): string {
    const baseFilename = prompt
        .slice(0, 100)
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    return `inline; filename="${baseFilename || "generated-model"}.glb"`;
}

export function mediaHeaders(
    prompt: string,
    safeParams: Model3dParams,
    result: Model3dGenerationResult,
): Headers {
    const headers = new Headers({
        "Content-Type": result.contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    });
    headers.set("Content-Disposition", contentDisposition(prompt));

    const modelUsed = result.trackingData?.actualModel || safeParams.model;
    const usage = result.trackingData?.usage || { completionImageTokens: 1 };
    const trackingHeaders = buildUsageHeaders(modelUsed, usage);
    for (const [key, value] of Object.entries(trackingHeaders)) {
        headers.set(key, value);
    }

    return headers;
}

export function throw3dError(error: unknown): never {
    if (error instanceof UpstreamError) throw error;

    const message = error instanceof Error ? error.message : String(error);
    throw new UpstreamError(500, {
        message: message || "3D model generation failed",
        cause: error,
    });
}
