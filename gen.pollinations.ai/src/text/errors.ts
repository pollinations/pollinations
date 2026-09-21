import { UpstreamError } from "@shared/error.ts";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ServiceError } from "./types.js";

function serializeDetails(details: unknown): string | undefined {
    if (details === undefined || details === null) return undefined;
    return typeof details === "string" ? details : JSON.stringify(details);
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
