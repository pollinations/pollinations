import { createMiddleware } from "hono/factory";

type Env = {
	Variables: {
		connectingIp: string;
	};
};

/**
 * Set connecting IP middleware
 * Extracts client IP from various headers and stores in context
 */
export const setConnectingIp = createMiddleware<Env>(async (c, next) => {
	const ip =
		c.req.header("cf-connecting-ip") ||
		c.req.header("x-real-ip") ||
		c.req.header("x-forwarded-for")?.split(",")[0].trim() ||
		"unknown";
	c.set("connectingIp", ip);
	console.debug("[CONNECTING IP]:", ip);
	await next();
});
