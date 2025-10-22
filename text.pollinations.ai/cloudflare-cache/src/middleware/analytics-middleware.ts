import { createMiddleware } from "hono/factory";
import { sendToAnalytics } from "../analytics.ts";

type Env = {
	Bindings: {
		GA_MEASUREMENT_ID?: string;
		GA_API_SECRET?: string;
	};
};

// Analytics event constants
const EVENTS = {
	REQUEST: "textRequested",
	SERVED_FROM_CACHE: "textServedFromCache",
	GENERATED: "textGenerated",
	FAILED: "textGenerationFailed",
} as const;

// Cache status constants
const CACHE_STATUS = {
	HIT: "hit",
	MISS: "miss",
	PENDING: "pending",
} as const;

interface AnalyticsParams {
	method?: string;
	pathname?: string;
	userAgent?: string;
	referer?: string;
	cacheStatus?: string;
	[key: string]: any;
}

/**
 * Analytics middleware - tracks all requests
 * Runs early in the chain to capture all traffic
 */
export const analyticsMiddleware = createMiddleware<Env>(async (c, next) => {
	const request = c.req.raw;
	const url = new URL(request.url);

	// Prepare analytics parameters
	const analyticsParams: AnalyticsParams = {
		method: request.method,
		pathname: url.pathname,
		userAgent: request.headers.get("user-agent") || "",
		referer: request.headers.get("referer") || "",
		cacheStatus: CACHE_STATUS.PENDING,
	};

	// Send initial request analytics (non-blocking)
	c.executionCtx.waitUntil(
		sendToAnalytics(request, EVENTS.REQUEST, analyticsParams, c.env),
	);

	// Continue to next middleware
	await next();

	// After response is ready, send appropriate analytics based on cache status
	const cacheHeader = c.res?.headers.get("X-Cache");
	if (cacheHeader === "HIT") {
		// Cache hit analytics
		c.executionCtx.waitUntil(
			sendToAnalytics(
				request,
				EVENTS.SERVED_FROM_CACHE,
				{ ...analyticsParams, cacheStatus: CACHE_STATUS.HIT },
				c.env,
			),
		);
	} else if (c.res?.ok) {
		// Successful generation analytics
		c.executionCtx.waitUntil(
			sendToAnalytics(
				request,
				EVENTS.GENERATED,
				{ ...analyticsParams, cacheStatus: CACHE_STATUS.MISS },
				c.env,
			),
		);
	} else if (c.res && !c.res.ok) {
		// Failed request analytics
		c.executionCtx.waitUntil(
			sendToAnalytics(
				request,
				EVENTS.FAILED,
				{
					...analyticsParams,
					cacheStatus: CACHE_STATUS.MISS,
					statusCode: c.res.status,
				},
				c.env,
			),
		);
	}
});
