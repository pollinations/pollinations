import { remapUpstreamStatus, UpstreamError } from "@shared/error.ts";
import { IMMUTABLE_CACHE_CONTROL } from "@shared/http/cache-control.ts";
import { buildUsageHeaders } from "@shared/registry/usage-headers.ts";
import type { Context } from "hono";
import type { Env } from "@/env.ts";
import { HttpError } from "../image/httpError.ts";
import { bufferToUint8Array } from "../image/utils/imageDownload.ts";
import {
    createAndReturnModel3d,
    type Model3dGenerationResult,
} from "./createAndReturnModel3d.ts";
import { syncModel3dEnvironment } from "./env.ts";
import { type Model3dParams, Model3dParamsSchema } from "./params.ts";

type Model3dContext = Context<Env>;

const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
    "model/gltf-binary": "glb",
    "model/ply": "ply",
    "model/obj": "obj",
    "model/vnd.usdz+zip": "usdz",
};

export async function generate3dResponse(
    c: Model3dContext,
    prompt: string,
    body: Record<string, unknown> = {},
): Promise<Response> {
    syncModel3dEnvironment(c.env);
    const originalPrompt = decodePrompt(prompt || "");
    const safeParams = parseModel3dParams(c, body);

    try {
        const result = await createAndReturnModel3d(originalPrompt, safeParams);
        assertNonEmptyMedia(result);
        return new Response(bufferToUint8Array(result.buffer), {
            headers: mediaHeaders(originalPrompt, safeParams, result),
        });
    } catch (error) {
        throw3dError(error);
    }
}

export async function handle3dPrompt(
    c: Model3dContext,
    prompt: string,
): Promise<Response> {
    return generate3dResponse(c, prompt, await readJsonBody(c));
}

async function readJsonBody(
    c: Model3dContext,
): Promise<Record<string, unknown>> {
    if (c.req.method !== "POST") return {};
    const contentType = c.req.header("content-type") || "";
    if (!contentType.includes("application/json")) return {};
    try {
        return (await c.req.json()) as Record<string, unknown>;
    } catch {
        return {};
    }
}

function decodePrompt(rawPrompt: string): string {
    try {
        return decodeURIComponent(rawPrompt);
    } catch {
        return rawPrompt;
    }
}

function parseModel3dParams(
    c: Model3dContext,
    body: Record<string, unknown>,
): Model3dParams {
    const queryParams = Object.fromEntries(new URL(c.req.url).searchParams);
    const mergedParams = {
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

function assertNonEmptyMedia(result: Model3dGenerationResult): void {
    if (!result.buffer || result.buffer.length === 0) {
        throw new HttpError("3D provider returned an empty response", 502);
    }
}

function contentDisposition(prompt: string, extension: string): string {
    const baseFilename = prompt
        .slice(0, 100)
        .replace(/[^a-z0-9\s-]/gi, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .toLowerCase();
    return `inline; filename="${baseFilename || "generated-model"}.${extension}"`;
}

function mediaHeaders(
    prompt: string,
    safeParams: Model3dParams,
    result: Model3dGenerationResult,
): Headers {
    const headers = new Headers({
        "Content-Type": result.contentType,
        "Cache-Control": IMMUTABLE_CACHE_CONTROL,
    });
    const extension = EXTENSION_BY_CONTENT_TYPE[result.contentType] || "glb";
    headers.set("Content-Disposition", contentDisposition(prompt, extension));

    const modelUsed = result.trackingData?.actualModel || safeParams.model;
    const usage = result.trackingData?.usage || { completionImageTokens: 1 };
    const trackingHeaders = buildUsageHeaders(modelUsed, usage);
    for (const [key, value] of Object.entries(trackingHeaders)) {
        headers.set(key, value);
    }

    return headers;
}

function throw3dError(error: unknown): never {
    if (error instanceof UpstreamError) throw error;

    if (error instanceof HttpError) {
        throw new UpstreamError(remapUpstreamStatus(error.status), {
            message: error.message,
            upstreamStatus: error.status,
            responseBody: JSON.stringify({ message: error.message }),
            cause: error,
        });
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new UpstreamError(500, {
        message: message || "3D model generation failed",
        cause: error,
    });
}
