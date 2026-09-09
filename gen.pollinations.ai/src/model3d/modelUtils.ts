import { Buffer } from "node:buffer";
import { UpstreamError } from "@shared/error.ts";
import { FalError } from "./models/falClient.ts";
import { InferenceportError } from "./models/inferenceportClient.ts";
import type { Model3dParams } from "./params.ts";

export function toUpstreamError(
    err: unknown,
    fallbackMessage = "3D generation failed",
): UpstreamError {
    if (err instanceof UpstreamError) return err;
    if (err instanceof InferenceportError || err instanceof FalError) {
        return UpstreamError.fromProvider(err.status ?? 502, {
            message: err.message,
            responseBody: err.responseBody,
        });
    }
    const message = err instanceof Error ? err.message : String(err);
    return UpstreamError.fromProvider(500, {
        message: message || fallbackMessage,
    });
}

export function requireImages(params: Model3dParams, modelLabel: string): void {
    if (params.image.length === 0) {
        throw UpstreamError.fromProvider(400, {
            message: `${modelLabel} requires at least one reference image (image= param)`,
        });
    }
}

export function requirePrompt(prompt: string, modelLabel: string): void {
    if (!prompt.trim()) {
        throw UpstreamError.fromProvider(400, {
            message: `${modelLabel} requires a text prompt`,
        });
    }
}

export async function downloadMesh(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw UpstreamError.fromProvider(502, {
            message: `Failed to download generated 3D model (HTTP ${response.status})`,
        });
    }
    return Buffer.from(await response.arrayBuffer());
}
