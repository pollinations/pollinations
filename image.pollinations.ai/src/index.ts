import "dotenv/config";
import type { IncomingMessage, ServerResponse } from "node:http";
import http from "node:http";
import { parse } from "node:url";
import debug from "debug";
import urldecode from "urldecode";
import { extractToken, getIp } from "../../shared/extractFromRequest.js";
import { logIp } from "../../shared/ipLogger.js";
import { countFluxJobs, handleRegisterEndpoint } from "./availableServers.js";
// IMAGE_CONFIG imported but used elsewhere
// import { IMAGE_CONFIG } from "./models.js";
import {
    type AuthResult,
    createAndReturnImageCached,
    type ImageGenerationResult,
} from "./createAndReturnImages.js";
import { createAndReturnVideo, isVideoModel } from "./createAndReturnVideos.js";
import { registerFeedListener, sendToFeedListeners } from "./feedListeners.js";
import { HttpError } from "./httpError.js";
import { getModelCounts } from "./modelCounter.js";
import { MODELS } from "./models.js";
import {
    normalizeAndTranslatePrompt,
    type TimingStep,
} from "./normalizeAndTranslatePrompt.js";
import { type ImageParams, ImageParamsSchema } from "./params.js";
import { createProgressTracker, type ProgressManager } from "./progressBar.js";
import { sleep } from "./util.ts";
import { buildTrackingHeaders } from "./utils/trackingHeaders.js";

// Queue configuration for image service (reserved for future use)
// const QUEUE_CONFIG = {
//     interval: 30000, // 30 seconds between requests per IP (no auth)
//     cap: 1, // Max 1 concurrent request per IP
// };

const logError = debug("pollinations:error");
const logApi = debug("pollinations:api");
const logAuth = debug("pollinations:auth");

export const currentJobs = [];

// In-memory hourly rate limiter for seedream and nanobanana
interface HourlyUsage {
    count: number;
    hourStart: number;
}
const hourlyUsage = new Map<string, HourlyUsage>();
const HOURLY_LIMIT = 10;
const HOUR_MS = 60 * 60 * 1000;

// Check and update hourly usage for an IP (reserved for future use)
const _checkHourlyLimit = (
    ip: string,
): { allowed: boolean; remaining: number; resetIn: number } => {
    const now = Date.now();
    const usage = hourlyUsage.get(ip);

    // No usage yet or hour has passed - reset
    if (!usage || now - usage.hourStart >= HOUR_MS) {
        hourlyUsage.set(ip, { count: 1, hourStart: now });
        return { allowed: true, remaining: HOURLY_LIMIT - 1, resetIn: HOUR_MS };
    }

    // Within the same hour
    if (usage.count >= HOURLY_LIMIT) {
        const resetIn = HOUR_MS - (now - usage.hourStart);
        return { allowed: false, remaining: 0, resetIn };
    }

    // Increment and allow
    usage.count++;
    const resetIn = HOUR_MS - (now - usage.hourStart);
    return { allowed: true, remaining: HOURLY_LIMIT - usage.count, resetIn };
};

/**
 * @function
 * @param {Object} res - The response object.
 */
const setCORSHeaders = (res: ServerResponse) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    res.setHeader("Access-Control-Expose-Headers", ["Content-Length"]);
};

/**
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<boolean>}
 */
const preMiddleware = async (
    pathname: string,
    req: IncomingMessage,
    res: ServerResponse,
): Promise<boolean> => {
    logApi("requestListener", req.url);

    if (pathname.startsWith("/feed")) {
        registerFeedListener(req, res);
        return false;
    }

    if (!pathname.startsWith("/prompt")) {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(
            JSON.stringify({
                error: "Not Found",
                message: "The requested endpoint was not found",
                path: pathname,
            }),
        );
        return false;
    }

    return true;
};

type ImageGenParams = {
    req: IncomingMessage;
    timingInfo: TimingStep[];
    originalPrompt: string;
    safeParams: ImageParams;
    referrer: string | null;
    progress: ProgressManager;
    requestId: string;
    authResult: AuthResult;
};

/**
 * @async
 * @function
 * @param {Object} params - The parameters object.
 * @returns {Promise<void>}
 */
const imageGen = async ({
    req,
    timingInfo,
    originalPrompt,
    safeParams,
    referrer,
    progress,
    requestId,
    authResult,
}: ImageGenParams): Promise<ImageGenerationResult> => {
    try {
        timingInfo.push({ step: "Start processing", timestamp: Date.now() });

        // Prompt processing
        progress.updateBar(requestId, 20, "Prompt", "Normalizing...");
        const { prompt, wasPimped, wasTransformedForBadDomain } =
            await normalizeAndTranslatePrompt(
                originalPrompt,
                req,
                timingInfo,
                safeParams,
                referrer,
            );
        progress.updateBar(requestId, 30, "Prompt", "Normalized");

        // For bad domains, log that we're using the transformed prompt
        if (wasTransformedForBadDomain) {
            logApi(
                "prompt transformed for bad domain, using alternative:",
                prompt,
            );
        }

        // Use the processed prompt for generation
        const generationPrompt = prompt;

        logApi("display prompt", prompt);
        logApi("generation prompt", generationPrompt);
        logApi("safeParams", safeParams);

        // Server selection and image generation
        progress.updateBar(
            requestId,
            40,
            "Server",
            "Selecting optimal server...",
        );
        progress.updateBar(requestId, 50, "Generation", "Preparing...");

        // Create user info object for passing to generation functions
        const userInfo = authResult;

        // All requests assumed to come from enter.pollinations.ai

        // Pass the complete user info object instead of individual properties
        const { buffer, ...maturity } = await createAndReturnImageCached(
            generationPrompt,
            safeParams,
            countFluxJobs(),
            originalPrompt,
            progress,
            requestId,
            wasTransformedForBadDomain,
            userInfo,
        );

        progress.updateBar(requestId, 50, "Generation", "Starting generation");

        progress.updateBar(requestId, 95, "Finalizing", "Processing complete");
        timingInfo.push({
            step: "Generation completed.",
            timestamp: Date.now(),
        });

        progress.updateBar(requestId, 100, "Complete", "Generation successful");
        progress.stop();

        // Safety checks
        if (maturity.isChild && maturity.isMature) {
            logApi("isChild and isMature, delaying response by 15 seconds");
            progress.updateBar(requestId, 85, "Safety", "Additional review...");
            await sleep(5000);
        }
        progress.updateBar(requestId, 90, "Safety", "Check complete");

        timingInfo.push({ step: "Image returned", timestamp: Date.now() });

        const imageURL = `https://image.pollinations.ai${req.url}`;

        // Cache and feed updates
        progress.updateBar(requestId, 95, "Cache", "Updating feed...");
        // if (!safeParams.nofeed) {
        //   if (!(maturity.isChild && maturity.isMature)) {
        // Create a clean object with consistent data types
        const feedData = {
            // Start with properly sanitized parameters
            ...safeParams,
            concurrentRequests: countFluxJobs(),
            imageURL,
            // Always use the display prompt which will be original prompt for bad domains
            prompt,
            // Extract only the specific properties we need from maturity, ensuring boolean types
            isChild: !!maturity.isChild,
            isMature: !!maturity.isMature,
            // Include maturity as a nested object for backward compatibility
            maturity,
            timingInfo: relativeTiming(timingInfo),
            // ip: getIp(req),
            status: "end_generating",
            referrer,
            // Use original wasPimped for normal domains, never for bad domains
            wasPimped,
            nsfw: !!(maturity.isChild || maturity.isMature),
            private: !!safeParams.nofeed,
            token: extractToken(req) && extractToken(req).slice(0, 2) + "...",
        };

        sendToFeedListeners(feedData, { saveAsLastState: true });
        // }
        // }
        progress.updateBar(requestId, 100, "Cache", "Updated");

        // Complete main progress
        progress.completeBar(requestId, "Image generation complete");
        progress.stop();

        return { buffer, ...maturity };
    } catch (error) {
        // Handle errors gracefully in progress bars
        progress.errorBar(requestId, "Generation failed");
        progress.stop();

        // Log detailed error information
        console.error("Image generation failed:", {
            error: error.message,
            stack: error.stack,
            requestId,
            prompt: originalPrompt,
            params: safeParams,
            referrer,
        });

        throw error;
    }
};

/**
 * @async
 * @function
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 * @returns {Promise<void>}
 */
const checkCacheAndGenerate = async (
    req: IncomingMessage,
    res: ServerResponse,
): Promise<void> => {
    const { pathname, query } = parse(req.url, true);

    const needsProcessing = await preMiddleware(pathname, req, res);

    if (!needsProcessing) return;

    const originalPrompt = urldecode(
        pathname.split("/prompt/")[1] || "random_prompt",
    );

    const referrer = req.headers?.["referer"] || req.headers?.origin;

    const requestId = Math.random().toString(36).substring(7);
    const progress = createProgressTracker().startRequest(requestId);
    progress.updateBar(requestId, 0, "Starting", "Request received");

    let timingInfo: TimingStep[] = [];
    let safeParams: ImageParams | undefined;

    try {
        // Validate parameters with proper error handling
        const parseResult = ImageParamsSchema.safeParse(query);
        if (!parseResult.success) {
            throw new HttpError(
                `Invalid parameters: ${parseResult.error.issues[0]?.message || "validation failed"}`,
                400,
                parseResult.error.issues,
            );
        }
        safeParams = parseResult.data;

        logApi("Request details:", { originalPrompt, safeParams, referrer });
        // Authentication and rate limiting is now handled by enter.pollinations.ai
        // Create a minimal authResult for compatibility
        const authResult: AuthResult = {
            authenticated: true,
            tokenAuth: false,
            referrerAuth: false,
            bypass: true,
            reason: "ENTER_GATEWAY",
            userId: null,
            username: null,
            debugInfo: {},
        };

        // Check if this is a video model
        const isVideo = isVideoModel(safeParams.model);

        // Handle video generation separately (with caching)
        if (isVideo) {
            progress.updateBar(requestId, 10, "Processing", "Generating video");
            timingInfo = [{ step: "Request received.", timestamp: Date.now() }];
            progress.setProcessing(requestId);

            // Generate video directly (no caching)
            const videoResult = await createAndReturnVideo(
                originalPrompt,
                safeParams,
                progress,
                requestId,
            );

            timingInfo.push({ step: "Video generated", timestamp: Date.now() });

            // Build headers for video response
            const headers = {
                "Content-Type": "video/mp4",
                "Cache-Control": "public, max-age=31536000, immutable",
            };

            // Add Content-Disposition with .mp4 extension
            if (originalPrompt) {
                const baseFilename = originalPrompt
                    .slice(0, 100)
                    .replace(/[^a-z0-9\s-]/gi, "")
                    .replace(/\s+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, "")
                    .toLowerCase();
                const filename = `${baseFilename || "generated-video"}.mp4`;
                headers["Content-Disposition"] =
                    `inline; filename="${filename}"`;
            }

            // Add tracking headers
            const trackingHeaders = buildTrackingHeaders(
                safeParams.model,
                videoResult.trackingData,
            );
            Object.assign(headers, trackingHeaders);

            res.writeHead(200, headers);
            res.write(videoResult.buffer);
            res.end();

            logApi("Video generation complete:", {
                originalPrompt,
                safeParams,
                referrer,
            });
            return;
        }

        // Generate image directly (no caching)
        progress.updateBar(requestId, 10, "Processing", "Generating image");
        timingInfo = [
            {
                step: "Request received.",
                timestamp: Date.now(),
            },
        ];

        // Generate image directly without queue
        timingInfo.push({
            step: "Start generating job",
            timestamp: Date.now(),
        });

        progress.setProcessing(requestId);

        const bufferAndMaturity = await imageGen({
            req,
            timingInfo,
            originalPrompt,
            safeParams,
            referrer,
            progress,
            requestId,
            authResult,
        });

        timingInfo.push({
            step: "End generating job",
            timestamp: Date.now(),
        });

        // Add headers for response
        const headers = {
            "Content-Type": "image/jpeg",
            "Cache-Control": "public, max-age=31536000, immutable",
        };

        // Add Content-Disposition header with sanitized filename
        if (originalPrompt) {
            // Create a filename from the prompt, limiting length and sanitizing
            const baseFilename = originalPrompt
                .slice(0, 100) // Limit to 100 characters
                .replace(/[^a-z0-9\s-]/gi, "") // Remove special characters except spaces and hyphens
                .replace(/\s+/g, "-") // Replace spaces with hyphens
                .replace(/-+/g, "-") // Replace multiple hyphens with single hyphen
                .replace(/^-|-$/g, "") // Remove leading/trailing hyphens
                .toLowerCase();

            const filename = `${baseFilename || "generated-image"}.jpg`;
            headers["Content-Disposition"] = `inline; filename="${filename}"`;
        }

        // Debug: Log trackingData before building headers
        logApi("=== TRACKING DATA BEFORE HEADERS ===");
        logApi(
            "bufferAndMaturity.trackingData:",
            JSON.stringify(bufferAndMaturity.trackingData, null, 2),
        );
        logApi("====================================");

        // Add tracking headers for enter service (GitHub issue #4170)
        const trackingHeaders = buildTrackingHeaders(
            safeParams.model,
            bufferAndMaturity.trackingData,
        );
        logApi("=== BUILT TRACKING HEADERS ===");
        logApi("trackingHeaders:", JSON.stringify(trackingHeaders, null, 2));
        logApi("===============================");
        Object.assign(headers, trackingHeaders);

        res.writeHead(200, headers);
        res.write(bufferAndMaturity.buffer);
        res.end();

        logApi("Generation complete:", {
            originalPrompt,
            safeParams,
            referrer,
        });
    } catch (error) {
        logError("Error generating image:", error);
        progress.errorBar(requestId, error.message || "Internal Server Error");
        progress.stop();

        // Determine the appropriate status code (default to 500 if not specified)
        const statusCode = error.status || 500;
        const errorType =
            statusCode === 400
                ? "Bad Request"
                : statusCode === 401
                  ? "Unauthorized"
                  : statusCode === 403
                    ? "Forbidden"
                    : statusCode === 429
                      ? "Too Many Requests"
                      : "Internal Server Error";

        // Log the error response using debug
        logError("Error response:", {
            requestId,
            statusCode,
            errorType,
            message: error.message,
        });

        res.writeHead(statusCode, {
            "Content-Type": "application/json",
            "X-Error-Type": errorType,
        });

        // Create a response object with error information
        const responseObj = {
            error: errorType,
            message: error.message,
            details: error.details,
            timingInfo: relativeTiming(timingInfo),
            requestId,
            requestParameters: {
                prompt: originalPrompt,
                ...safeParams,
                referrer,
            },
            queueInfo: null,
        };

        // Add queue info for 429 errors
        if (statusCode === 429 && error.queueInfo) {
            responseObj.queueInfo = error.queueInfo;
        }

        res.end(JSON.stringify(responseObj));
    }
};

// Modify the server creation to set CORS headers for all requests
const server = http.createServer((req, res) => {
    setCORSHeaders(res);

    const parsedUrl = parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // IP logging for security investigation
    const ip = getIp(req);
    const model = (parsedUrl.query?.model as string) || "unknown";
    logIp(ip, "image", `path=${pathname} model=${model}`);

    // Handle deprecated /models endpoint BEFORE auth check
    if (pathname === "/models") {
        res.writeHead(410, {
            "Content-Type": "application/json",
            "Cache-Control":
                "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        });
        res.end(
            JSON.stringify({
                error: "Endpoint moved",
                message:
                    "The /models endpoint has been moved to the API gateway. Please use: https://enter.pollinations.ai/api/generate/image/models",
                deprecated_endpoint: `${req.headers["x-forwarded-proto"] || "http"}://${req.headers.host}/models`,
                new_endpoint:
                    "https://enter.pollinations.ai/api/generate/image/models",
                documentation: "https://enter.pollinations.ai/api/docs",
            }),
        );
        return;
    }

    // Handle /register endpoint BEFORE auth check (heartbeat from GPU servers)
    if (pathname === "/register") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control":
                "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        });
        handleRegisterEndpoint(req, res);
        return;
    }

    // Verify PLN_ENTER_TOKEN
    const token = req.headers["x-enter-token"];
    const expectedToken = process.env.PLN_ENTER_TOKEN;

    if (expectedToken && token !== expectedToken) {
        logAuth("❌ Invalid or missing PLN_ENTER_TOKEN from IP:", getIp(req));
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Unauthorized" }));
        return;
    }

    if (expectedToken) {
        logAuth("✅ Valid PLN_ENTER_TOKEN from IP:", getIp(req));
    } else {
        logAuth("!  PLN_ENTER_TOKEN not configured - allowing request");
    }

    if (
        pathname ===
        "/.well-known/acme-challenge/w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G"
    ) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end(
            "w7JbAPtwFN_ntyNHudgKYyaZ7qiesTl4LgFa4fBr1DuEL_Hyd4O3hdIviSop1S3G.r54qAqCZSs4xyyeamMffaxyR1FWYVb5OvwUh8EcrhpI",
        );
        return;
    }

    if (pathname === "/crossdomain.xml") {
        res.writeHead(200, { "Content-Type": "application/xml" });
        res.end(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
        return;
    }

    if (pathname === "/about") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control":
                "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        });
        const modelDetails = Object.entries(MODELS).map(([name, config]) => ({
            name,
            enhance: config.enhance || false,
            defaultSideLength: config.defaultSideLength ?? 1024,
        }));
        res.end(JSON.stringify(modelDetails));
        return;
    }

    if (pathname === "/model-stats") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Cache-Control":
                "no-store, no-cache, must-revalidate, proxy-revalidate",
            Pragma: "no-cache",
            Expires: "0",
        });
        getModelCounts()
            .then((counts) => {
                res.end(JSON.stringify(counts));
            })
            .catch(() => {
                res.end(JSON.stringify({}));
            });
        return;
    }

    checkCacheAndGenerate(req, res);
});

// Set the timeout to 5 minutes (300,000 milliseconds)
server.setTimeout(300000, (socket) => {
    socket.destroy();
});

server.on("connection", (socket) => {
    socket.on("timeout", () => {
        socket.destroy();
    });

    socket.on("error", (_error) => {
        socket.destroy();
    });
});

const port = process.env.PORT || 16384;
server.listen(port, () => {
    console.log(`🌸 Image server listening on port ${port}`);
    console.log(`🔗 Test URL: http://localhost:${port}/prompt/pollinations`);
    console.log(`✨ All requests assumed to come from enter.pollinations.ai`);

    // Debug environment info
    const debugEnv = process.env.DEBUG;
    if (debugEnv) {
        console.log(`🐛 Debug mode: ${debugEnv}`);
    } else {
        console.log(
            `💡 Pro tip: Want debug logs? Run with DEBUG=* for all the deets! ✨`,
        );
    }
});

function relativeTiming(timingInfo: TimingStep[]) {
    return timingInfo.map((info) => ({
        ...info,
        timestamp: info.timestamp - timingInfo[0].timestamp,
    }));
}
