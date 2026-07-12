import { Buffer } from "node:buffer";
import { HttpError } from "../image/httpError.ts";
import { FalError } from "./models/falClient.ts";
import { InferenceportError } from "./models/inferenceportClient.ts";
import type { Model3dParams } from "./params.ts";

export function toHttpError(
    err: unknown,
    fallbackMessage = "3D generation failed",
): HttpError {
    if (err instanceof HttpError) return err;
    if (err instanceof InferenceportError || err instanceof FalError) {
        return new HttpError(err.message, err.status ?? 502);
    }
    const message = err instanceof Error ? err.message : String(err);
    return new HttpError(message || fallbackMessage, 500);
}

export function requireImages(params: Model3dParams, modelLabel: string): void {
    if (params.image.length === 0) {
        throw new HttpError(
            `${modelLabel} requires at least one reference image (image= param)`,
            400,
        );
    }
}

export function requirePrompt(prompt: string, modelLabel: string): void {
    if (!prompt.trim()) {
        throw new HttpError(`${modelLabel} requires a text prompt`, 400);
    }
}

export async function downloadMesh(url: string): Promise<Buffer> {
    const response = await fetch(url);
    if (!response.ok) {
        throw new HttpError(
            `Failed to download generated 3D model (HTTP ${response.status})`,
            502,
        );
    }
    return Buffer.from(await response.arrayBuffer());
}
