import { Hono } from "hono";
import { cors } from "hono/cors";
import { analyticsMiddleware } from "./middleware/analytics-middleware.ts";
import { exactCache } from "./middleware/exact-cache.ts";
import { proxyOrigin } from "./middleware/proxy-origin.ts";
import { setConnectingIp } from "./middleware/set-connecting-ip.ts";

interface Env {
	TEXT_BUCKET: R2Bucket;
	ORIGIN_HOST: string;
	GA_MEASUREMENT_ID?: string;
	GA_API_SECRET?: string;
	ANALYTICS_URL?: string;
}

type Variables = {
	connectingIp?: string;
	cacheKey?: string;
};

const app = new Hono<{ Bindings: Env; Variables: Variables }>();

// Apply CORS to all routes
app.use(
	cors({
		origin: "*",
		allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
		allowHeaders: ["Content-Type", "Authorization"],
	}),
);

// Main route with middleware chain
app.all(
	"*",
	setConnectingIp,
	analyticsMiddleware,
	exactCache,
	proxyOrigin,
);

export default app;
