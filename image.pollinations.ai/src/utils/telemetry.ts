import { sendTinybirdEvent } from "../../observability/tinybirdTracker.js";
import type { AuthResult } from "../createAndReturnImages.js";

interface ImageTelemetryData {
    requestId: string;
    model: string;
    duration: number;
    status: "success" | "error";
    authResult?: AuthResult;
    error?: Error;
}

/**
 * Send image generation telemetry with minimal processing
 * Fire-and-forget like text service - don't block request completion
 */
export function sendImageTelemetry(data: ImageTelemetryData): void {
    const startTime = new Date(Date.now() - data.duration);
    const endTime = new Date();

    // Fire and forget - don't await, don't block the request
    sendTinybirdEvent({
        startTime,
        endTime,
        requestId: data.requestId,
        model: data.model,
        duration: data.duration,
        status: data.status,
        project: "image.pollinations.ai",
        environment: process.env.NODE_ENV || "production",
        user: data.authResult?.username || data.authResult?.userId || "anonymous",
        username: data.authResult?.username,
        organization: data.authResult?.userId ? "pollinations" : undefined,
        tier: data.authResult?.tier,
        ...(data.error && { error: data.error }),
    }).catch(err => {
        // Silently fail telemetry - don't impact user experience
        console.error("Telemetry failed:", err);
    });
}
