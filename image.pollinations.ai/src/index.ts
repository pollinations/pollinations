import debug from "debug";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { countFluxJobs, registerServer } from "./availableServers.js";
import {
    type AuthResult,
    createAndReturnImageCached,
} from "./createAndReturnImages.js";
import { createAndReturnVideo, isVideoModel } from "./createAndReturnVideos.js";
import { sendToFeedListeners } from "./feedListeners.js";
import { HttpError } from "./httpError.js";
import { IMAGE_CONFIG } from "./models.js";
import {
    type MinimalRequest,
    normalizeAndTranslatePrompt,
    type TimingStep,
} from "./normalizeAndTranslatePrompt.js";
import { type ImageParams, ImageParamsSchema } from "./params.js";
import { createProgressTracker } from "./progressBar.js";
import { sleep } from "./util.js";
import { buildTrackingHeaders } from "./utils/trackingHeaders.js";

const logError = debug("pollinations:error");
const logApi = debug("pollinations:api");
const logAuth = debug("pollinations:auth");

const app = new Hono();

// --- Middleware ---

app.use("*", cors());

// Sync Cloudflare Worker env bindings to process.env.
// NOTE: This is safe because all bindings are identical across concurrent requests
// on the same isolate. If per-request env values ever differ, this becomes a race condition
// and should be replaced with explicit env passing via Hono context.
app.use("*", async (c, next) => {
    for (const [key, value] of Object.entries(c.env)) {
        if (typeof value === "string") {
            process.env[key] = value;
        }
    }
    await next();
});

// IP logging
app.use("*", async (c, next) => {
    const ip =
        c.req.header("cf-connecting-ip") ||
        c.req.header("x-real-ip") ||
        c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
        "unknown";
    const model = new URL(c.req.url).searchParams.get("model") || "unknown";
    console.log(
        `[IP-LOG] [${new Date().toISOString()}] [image] IP=${ip} path=${c.req.path} model=${model}`,
    );
    await next();
});

// Validate pre-shared key from proxy
app.use("*", async (c, next) => {
    const expectedPsk = process.env.PROXY_PSK;
    if (!expectedPsk) {
        await next();
        return;
    }
    if (c.req.header("x-proxy-psk") !== expectedPsk) {
        return c.text("Unauthorized", 401);
    }
    await next();
});

// Verify PLN_ENTER_TOKEN (skip for certain endpoints)
app.use("*", async (c, next) => {
    const path = c.req.path;

    if (
        path === "/register" ||
        path === "/models" ||
        path === "/about" ||
        path === "/crossdomain.xml" ||
        path === "/"
    ) {
        await next();
        return;
    }

    const token = c.req.header("x-enter-token");
    const expectedToken = process.env.PLN_ENTER_TOKEN;

    if (expectedToken && token !== expectedToken) {
        logAuth(
            "Invalid or missing PLN_ENTER_TOKEN from IP:",
            c.req.header("cf-connecting-ip") || "unknown",
        );
        return c.json({ error: "Unauthorized" }, 403);
    }

    if (expectedToken) {
        logAuth("Valid PLN_ENTER_TOKEN");
    } else {
        logAuth("PLN_ENTER_TOKEN not configured - allowing request");
    }

    await next();
});

// --- Static routes ---

app.get("/", (c) => {
    return c.redirect(
        "https://github.com/pollinations/pollinations/blob/main/APIDOCS.md",
        301,
    );
});

app.get("/models", (c) => {
    c.header(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    return c.json(
        {
            error: "Endpoint moved",
            message:
                "The /models endpoint has been moved to the API gateway. Please use: https://enter.pollinations.ai/api/generate/image/models",
            new_endpoint:
                "https://enter.pollinations.ai/api/generate/image/models",
            documentation: "https://enter.pollinations.ai/api/docs",
        },
        410,
    );
});

app.get("/about", (c) => {
    c.header(
        "Cache-Control",
        "no-store, no-cache, must-revalidate, proxy-revalidate",
    );
    const modelDetails = Object.entries(IMAGE_CONFIG).map(([name, config]) => ({
        name,
        enhance: config.enhance || false,
        defaultSideLength:
            (config as { defaultSideLength?: number }).defaultSideLength ??
            1024,
    }));
    return c.json(modelDetails);
});

app.get("/crossdomain.xml", (c) => {
    c.header("Content-Type", "application/xml");
    return c.text(`<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">
<cross-domain-policy>
  <allow-access-from domain="*" secure="false"/>
</cross-domain-policy>`);
});

// --- Register endpoint (heartbeat from GPU servers) ---

app.post("/register", async (c) => {
    try {
        const body = await c.req.json();
        if (body.url) {
            registerServer(body.url, body.type || "flux");
            return c.json({
                success: true,
                message: "Server registered successfully",
            });
        }
        return c.json({
            success: false,
            message: "Invalid request body - url is required",
        });
    } catch {
        return c.json({ success: false, message: "Invalid JSON" });
    }
});

app.get("/register", (c) => {
    // Simplified for Worker - returns empty server list
    return c.json([]);
});

// --- Feed endpoint ---

app.get("/feed*", (c) => {
    // SSE feed is not supported in Workers mode.
    return c.text("Feed not available in Workers mode", 501);
});

// --- Helper functions ---

function relativeTiming(timingInfo: TimingStep[]) {
    if (timingInfo.length === 0) return [];
    return timingInfo.map((info) => ({
        ...info,
        timestamp: info.timestamp - timingInfo[0].timestamp,
    }));
}

// --- Core image/video generation handler ---

app.get("/prompt/*", async (c) => {
    const rawPrompt = c.req.path.split("/prompt/")[1] || "random_prompt";
    let originalPrompt: string;
    try {
        originalPrompt = decodeURIComponent(rawPrompt);
    } catch {
        originalPrompt = rawPrompt;
    }

    const referrer = c.req.header("referer") || c.req.header("origin") || null;
    const requestId = Math.random().toString(36).substring(7);
    const progress = createProgressTracker().startRequest(requestId);
    progress.updateBar(requestId, 0, "Starting", "Request received");

    let timingInfo: TimingStep[] = [];
    let safeParams: ImageParams | undefined;

    try {
        // Validate parameters
        const query = Object.fromEntries(new URL(c.req.url).searchParams);
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

        // Minimal authResult (enter gateway handles real auth)
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

        if (isVideo) {
            progress.updateBar(requestId, 10, "Processing", "Generating video");
            timingInfo = [{ step: "Request received.", timestamp: Date.now() }];
            progress.setProcessing(requestId);

            const videoResult = await createAndReturnVideo(
                originalPrompt,
                safeParams,
                progress,
                requestId,
            );

            timingInfo.push({
                step: "Video generated",
                timestamp: Date.now(),
            });

            c.header("Content-Type", "video/mp4");
            c.header("Cache-Control", "public, max-age=31536000, immutable");

            if (originalPrompt) {
                const baseFilename = originalPrompt
                    .slice(0, 100)
                    .replace(/[^a-z0-9\s-]/gi, "")
                    .replace(/\s+/g, "-")
                    .replace(/-+/g, "-")
                    .replace(/^-|-$/g, "")
                    .toLowerCase();
                const filename = `${baseFilename || "generated-video"}.mp4`;
                c.header(
                    "Content-Disposition",
                    `inline; filename="${filename}"`,
                );
            }

            const trackingHeaders = buildTrackingHeaders(
                safeParams.model,
                videoResult.trackingData,
            );
            for (const [key, value] of Object.entries(trackingHeaders)) {
                c.header(key, String(value));
            }

            return c.body(videoResult.buffer);
        }

        // Image generation
        progress.updateBar(requestId, 10, "Processing", "Generating image");
        timingInfo = [{ step: "Request received.", timestamp: Date.now() }];
        timingInfo.push({
            step: "Start generating job",
            timestamp: Date.now(),
        });
        progress.setProcessing(requestId);

        // Prompt processing
        progress.updateBar(requestId, 20, "Prompt", "Normalizing...");
        const { prompt, wasPimped, wasTransformedForBadDomain } =
            await normalizeAndTranslatePrompt(
                originalPrompt,
                {
                    headers: Object.fromEntries(c.req.raw.headers.entries()),
                    url: c.req.url,
                } satisfies MinimalRequest,
                timingInfo,
                safeParams,
                referrer,
            );
        progress.updateBar(requestId, 30, "Prompt", "Normalized");

        logApi("display prompt", prompt);
        logApi("safeParams", safeParams);

        // Generate image
        const { buffer, trackingData, ...maturity } =
            await createAndReturnImageCached(
                prompt,
                safeParams,
                countFluxJobs(),
                originalPrompt,
                progress,
                requestId,
                wasTransformedForBadDomain,
                authResult,
            );

        timingInfo.push({
            step: "End generating job",
            timestamp: Date.now(),
        });

        // Safety: delay response for flagged child+mature content to discourage abuse.
        // Reduced from 15s (Node.js) to 5s for Workers wall-clock budget.
        if (maturity.isChild && maturity.isMature) {
            logApi("isChild and isMature, delaying response by 5 seconds");
            await sleep(5000);
        }

        timingInfo.push({ step: "Image returned", timestamp: Date.now() });

        // Feed update (best-effort, non-blocking)
        try {
            const feedData = {
                ...safeParams,
                concurrentRequests: countFluxJobs(),
                imageURL: `https://image.pollinations.ai${c.req.path}`,
                prompt,
                isChild: !!maturity.isChild,
                isMature: !!maturity.isMature,
                maturity,
                timingInfo: relativeTiming(timingInfo),
                status: "end_generating",
                referrer,
                wasPimped,
                nsfw: !!(maturity.isChild || maturity.isMature),
                private: !!safeParams.nofeed,
            };
            sendToFeedListeners(feedData, { saveAsLastState: true });
        } catch {
            // Non-critical
        }

        // Detect image format from magic bytes
        const isPng =
            buffer[0] === 0x89 &&
            buffer[1] === 0x50 &&
            buffer[2] === 0x4e &&
            buffer[3] === 0x47;
        const isWebp =
            buffer[8] === 0x57 &&
            buffer[9] === 0x45 &&
            buffer[10] === 0x42 &&
            buffer[11] === 0x50;
        const contentType = isPng
            ? "image/png"
            : isWebp
              ? "image/webp"
              : "image/jpeg";
        const ext = isPng ? "png" : isWebp ? "webp" : "jpg";

        // Response headers
        c.header("Content-Type", contentType);
        c.header("Cache-Control", "public, max-age=31536000, immutable");

        if (originalPrompt) {
            const baseFilename = originalPrompt
                .slice(0, 100)
                .replace(/[^a-z0-9\s-]/gi, "")
                .replace(/\s+/g, "-")
                .replace(/-+/g, "-")
                .replace(/^-|-$/g, "")
                .toLowerCase();
            const filename = `${baseFilename || "generated-image"}.${ext}`;
            c.header("Content-Disposition", `inline; filename="${filename}"`);
        }

        const trackingHeaders = buildTrackingHeaders(
            safeParams.model,
            trackingData,
        );
        for (const [key, value] of Object.entries(trackingHeaders)) {
            c.header(key, String(value));
        }

        progress.completeBar(requestId, "Image generation complete");
        progress.stop();

        return c.body(buffer);
    } catch (error: any) {
        logError("Error generating image:", error);
        progress.errorBar(requestId, error.message || "Internal Server Error");
        progress.stop();

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

        return c.json(
            {
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
            },
            statusCode as 400,
        );
    }
});

export default app;
