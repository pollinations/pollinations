import { createMiddleware } from "hono/factory";

type Env = {
	Bindings: {
		TEXT_BUCKET: R2Bucket;
		ORIGIN_HOST: string;
	};
	Variables: {
		cacheKey?: string;
	};
};

export const exactCache = createMiddleware<Env>(async (c, next) => {
	const request = c.req.raw;
	const url = new URL(request.url);

	// Skip caching for certain paths
	const NON_CACHE_PATHS = ["/models", "/feed", "/openai/models"];
	if (NON_CACHE_PATHS.some((path) => url.pathname.startsWith(path))) {
		return next();
	}

	// Generate cache key - include body for POST/PUT requests
	let cacheKey = url.pathname + url.search;
	if (request.method === "POST" || request.method === "PUT") {
		const body = await request.clone().text();
		if (body) {
			// Hash the body to keep key reasonable length
			const encoder = new TextEncoder();
			const data = encoder.encode(body);
			const hashBuffer = await crypto.subtle.digest("SHA-256", data);
			const hashArray = Array.from(new Uint8Array(hashBuffer));
			const bodyHash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
			cacheKey = `${cacheKey}|${bodyHash}`;
		}
	}
	console.log("[EXACT] Cache key:", cacheKey);

	// Store cache key in context for streaming cache to use
	c.set("cacheKey", cacheKey);

	// Try to get from cache
	try {
		const cached = await c.env.TEXT_BUCKET.get(cacheKey);
		if (cached) {
			console.log("[EXACT] Cache hit");
			c.header("X-Cache", "HIT");
			c.header("X-Cache-Type", "EXACT");
			return c.body(cached.body);
		}
		console.log("[EXACT] Cache miss");
		c.header("X-Cache", "MISS");
	} catch (error) {
		console.error("[EXACT] Error retrieving cached response:", error);
	}

	// No cache hit, continue to next middleware
	await next();

	// Note: Response caching is now handled by proxy-origin middleware
	// which supports both streaming and non-streaming responses
});
