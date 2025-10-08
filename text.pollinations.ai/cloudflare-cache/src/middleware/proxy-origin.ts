import { createMiddleware } from "hono/factory";
import { proxy } from "hono/proxy";

type Env = {
	Bindings: {
		ORIGIN_HOST: string;
	};
	Variables: {
		connectingIp?: string;
	};
};

/**
 * Proxy middleware - forwards requests to origin server
 * This is the final middleware in the chain when no cache hit occurs
 */
export const proxyOrigin = createMiddleware<Env>(async (c) => {
	const clientIP = c.get("connectingIp") || c.req.header("cf-connecting-ip") || "";
	const targetUrl = new URL(c.req.url);
	targetUrl.hostname = c.env.ORIGIN_HOST;
	targetUrl.port = "";
	targetUrl.protocol = "https:";

	console.debug("[PROXY] Forwarding to origin:", targetUrl.toString());

	return proxy(targetUrl, {
		...c.req,
		headers: {
			...c.req.header(),
			"x-forwarded-for": clientIP,
			"x-forwarded-host": c.req.header("host") || "",
			"x-real-ip": clientIP,
			"cf-connecting-ip": clientIP,
		},
	});
});
