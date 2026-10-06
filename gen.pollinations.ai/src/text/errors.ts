import { remapUpstreamStatus, UpstreamError } from "@shared/error.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import {
    CONTENT_POLICY_STATUS,
    isContentPolicyViolation,
} from "../image/utils/contentModeration.ts";
import type { ServiceError } from "./types.js";

function serializeDetails(details: unknown): string | undefined {
    if (details === undefined || details === null) return undefined;
    return typeof details === "string" ? details : JSON.stringify(details);
}

/** Classify provider errors consistently for HTTP responses and stream metrics. */
export function apiErrorStatus(details: unknown, status: number): number {
    const serialized = serializeDetails(details) ?? "";
    if (isContentPolicyViolation(serialized)) return CONTENT_POLICY_STATUS;
    if (
        /no endpoints found that support (?:image|audio|video) input|multimodal processing failed|(?:image|audio) decode error|invalid or unsupported audio file|failed to load image|cannot identify image file|image URL must be a valid and downloadable URL or look like data:|Tool call id was [^\r\n]* but must be a-z, A-Z, 0-9, with a length of 9\./i.test(
            serialized,
        )
    )
        return 400;
    return remapUpstreamStatus(status);
}

export function throwTextError(error: ServiceError): never {
    if (error instanceof UpstreamError) throw error;
    const status =
        typeof error.status === "number"
            ? error.status
            : typeof error.code === "number"
              ? error.code
              : 500;

    throw new UpstreamError(status as ContentfulStatusCode, {
        message: error.message || "Text generation failed",
        // Propagate only — the code is decided at the throw site.
        errorCode: error.errorCode,
        requestUrl: error.requestUrl,
        upstreamStatus: error.upstreamStatus,
        responseBody:
            error.responseBody ??
            serializeDetails(error.details || error.response?.data),
        upstreamHeaders: error.upstreamHeaders,
        cause: error,
    });
}
