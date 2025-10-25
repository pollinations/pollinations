/**
 * Turnstile verification for Hacktoberfest apps
 * Shared between text and image cache workers
 */

/**
 * Verify Turnstile token with Cloudflare API
 */
export async function verifyTurnstile(token, ip, hostname, env) {
	// Use production secret by default, fall back to test secret for development
	const secret = env.TURNSTILE_SECRET_KEY || env.TURNSTILE_TEST_SECRET;

	if (!secret) {
		console.log("[turnstile] ⚠️ TURNSTILE_SECRET_KEY not configured");
		return { success: false, "error-codes": ["missing-secret"] };
	}
	
	console.log("[turnstile] Using secret type:", env.TURNSTILE_TEST_SECRET ? "TEST" : "PRODUCTION");

	try {
		const response = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					secret,
					response: token,
					remoteip: ip,
				}),
			},
		);

		const result = await response.json();
	console.log(`[turnstile] Verification result for ${hostname}: success=${result.success}, error-codes=${result["error-codes"]?.join(",") || "none"}`);

	// Skip hostname validation for test keys (they always return 'example.com')
	const isTestKey = result.metadata?.result_with_testing_key === true;
	
	// Verify hostname matches (skip for test keys)
	if (result.success && !isTestKey && result.hostname !== hostname) {
		console.log(
			`[turnstile] ❌ Hostname mismatch: expected ${hostname}, got ${result.hostname}`,
		);
		return { success: false, "error-codes": ["hostname-mismatch"] };
	}
	
	if (isTestKey) {
		console.log("[turnstile] ℹ️ Using test key, skipping hostname validation");
	}

	return result;
	} catch (error) {
		console.log("[turnstile] ❌ Verification error:", error);
		return { success: false, "error-codes": ["network-error"] };
	}
}

/**
 * Check if request is from Hacktoberfest subdomain and needs verification
 */
export function needsTurnstileVerification(origin, method) {
	if (!origin) return false;
	
	// Skip verification for OPTIONS preflight requests
	if (method === "OPTIONS") return false;

	// Allow localhost for testing
	if (origin.startsWith("http://localhost:")) return true;

	// Check for Hacktoberfest subdomains (but not main pollinations.ai domains)
	if (origin.endsWith(".pollinations.ai")) {
		// Exclude main API domains
		const mainDomains = [
			"text.pollinations.ai",
			"image.pollinations.ai",
			"auth.pollinations.ai",
		];
		const hostname = new URL(origin).hostname;
		return !mainDomains.includes(hostname);
	}

	return false;
}

/**
 * Middleware to verify Turnstile token for Hacktoberfest requests
 * Returns null if verification passes, or Response object if it fails
 */
export async function checkTurnstile(request, env) {
	const origin = request.headers.get("origin");
	const method = request.method;

	if (!needsTurnstileVerification(origin, method)) {
		return null; // No verification needed
	}

	console.log(`[turnstile] 🔐 Hacktoberfest request from: ${origin}`);

	// Get Turnstile token from header
	const token = request.headers.get("x-turnstile-token");
	if (!token) {
		console.log("[turnstile] ❌ Missing Turnstile token");
		return new Response(JSON.stringify({ error: "Missing Turnstile token" }), {
			status: 403,
			headers: {
				"Content-Type": "application/json",
				"Access-Control-Allow-Origin": origin,
			},
		});
	}

	// Get client IP
	const ip = request.headers.get("cf-connecting-ip") || "";
	const hostname = new URL(origin).hostname;

	// Verify the token
	const verification = await verifyTurnstile(token, ip, hostname, env);
	if (!verification.success) {
		console.log(
			"[turnstile] ❌ Verification failed:",
			verification["error-codes"],
		);
		return new Response(
			JSON.stringify({
				error: "Invalid Turnstile token",
				codes: verification["error-codes"],
			}),
			{
				status: 403,
				headers: {
					"Content-Type": "application/json",
					"Access-Control-Allow-Origin": origin,
				},
			},
		);
	}

	console.log("[turnstile] ✅ Verification successful");
	return null; // Verification passed
}
