/**
 * Turnstile verification middleware for Hacktoberfest apps
 */
import type { Context, Next } from "hono";
import type { Env } from "../env";
import { checkTurnstile } from "../../../../shared/turnstile.js";

/**
 * Hono middleware to verify Turnstile tokens for Hacktoberfest requests
 */
export async function turnstileVerification(c: Context<Env>, next: Next) {
	// Convert Hono context to a Request-like object for the shared function
	const request = c.req.raw;
	const env = c.env;

	// Check Turnstile verification
	const turnstileResponse = await checkTurnstile(request, env);

	// If verification failed, add CORS headers and return the error response
	if (turnstileResponse) {
		const origin = request.headers.get("origin");
		if (origin) {
			turnstileResponse.headers.set("Access-Control-Allow-Origin", origin);
			turnstileResponse.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
			turnstileResponse.headers.set("Access-Control-Allow-Headers", "Content-Type, X-Turnstile-Token");
		}
		return turnstileResponse;
	}

	// Verification passed, continue to next middleware
	await next();
}
