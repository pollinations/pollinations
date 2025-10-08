import { createMiddleware } from "hono/factory";
import {
	isStreamingResponse,
	wrapStreamingResponse,
	cacheNonStreamingResponse,
} from "./streaming-cache-handler.ts";

type Env = {
	Bindings: {
		ORIGIN_HOST: string;
		TEXT_BUCKET: R2Bucket;
	};
	Variables: {
		connectingIp?: string;
		cacheKey?: string;
	};
};

/**
 * Proxy middleware - forwards requests to origin server with streaming cache support
 * 
 * This middleware:
 * 1. Manually fetches from origin (instead of using Hono's proxy helper)
 * 2. Detects streaming vs non-streaming responses
 * 3. For streaming: captures chunks while passing through to client, caches in background
 * 4. For non-streaming: caches immediately
 * 
 * This matches the master branch behavior.
 */
export const proxyOrigin = createMiddleware<Env>(async (c) => {
	const clientIP = c.get("connectingIp") || c.req.header("cf-connecting-ip") || "";
	const cacheKey = c.get("cacheKey");

	// Build target URL
	const targetUrl = new URL(c.req.url);
	targetUrl.hostname = c.env.ORIGIN_HOST;
	targetUrl.port = "";
	targetUrl.protocol = "https:";

	console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());

	// Build headers
	const headers = new Headers(c.req.raw.headers);
	headers.set("x-forwarded-for", clientIP);
	headers.set("x-forwarded-host", c.req.header("host") || "");
	headers.set("x-real-ip", clientIP);
	headers.set("cf-connecting-ip", clientIP);

	// Manual fetch (instead of Hono's proxy helper) to intercept the stream
	const originResponse = await fetch(targetUrl.toString(), {
		method: c.req.method,
		headers,
		body: c.req.raw.body,
		// @ts-ignore - Cloudflare Workers specific
		cf: { cacheTtl: 0 },
	});

	// Check if we should cache this response
	const shouldCache =
		originResponse.ok && cacheKey && originResponse.headers.get("x-cache") !== "HIT";

	if (!shouldCache) {
		console.log("[PROXY] Not caching response");
		return originResponse;
	}

	// Detect streaming based on Content-Length (match master)
	const isStreaming = isStreamingResponse(originResponse);

	// Handle non-streaming responses (cache immediately)
	if (!isStreaming) {
		console.log("[PROXY] Non-streaming response, caching immediately");

		c.executionCtx.waitUntil(
			cacheNonStreamingResponse(originResponse, cacheKey, c.env.TEXT_BUCKET),
		);

		return originResponse;
	}

	// Handle streaming responses - capture chunks while streaming
	console.log("[PROXY] Streaming response detected, setting up capture");

	const { transformedStream, originalHeaders } = wrapStreamingResponse(originResponse, {
		cacheKey,
		bucket: c.env.TEXT_BUCKET,
		executionCtx: c.executionCtx,
	});

	// Return the transformed stream to client
	return new Response(transformedStream, {
		status: originResponse.status,
		statusText: originResponse.statusText,
		headers: originalHeaders,
	});
});
