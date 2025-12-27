import { createMiddleware } from "hono/factory";
import type { LoggerVariables } from "./logger.ts";
import type { AuthVariables } from "./auth.ts";

export type TurnstileVariables = {
    turnstile: {
        verified: boolean;
        hostname?: string;
    };
};

export type TurnstileEnv = {
    Bindings: CloudflareBindings;
    Variables: LoggerVariables & AuthVariables & TurnstileVariables;
};

/** Turnstile settings stored in API key metadata */
export interface TurnstileSettings {
    enabled: boolean;
    hostnames: string[];
}

interface TurnstileVerifyResult {
    success: boolean;
    "error-codes"?: string[];
    hostname?: string;
    challenge_ts?: string;
    metadata?: {
        result_with_testing_key?: boolean;
    };
}

/**
 * Verify Turnstile token with Cloudflare API
 */
async function verifyTurnstile(
    token: string,
    ip: string,
    secret: string,
): Promise<TurnstileVerifyResult> {
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
        return await response.json();
    } catch (error) {
        console.error("[turnstile] Verification error:", error);
        return { success: false, "error-codes": ["network-error"] };
    }
}

/**
 * Extract Turnstile settings from API key metadata
 */
function getTurnstileSettings(
    apiKey: { metadata?: Record<string, unknown> } | undefined,
): TurnstileSettings | null {
    if (!apiKey?.metadata) return null;
    const turnstile = apiKey.metadata.turnstile as
        | TurnstileSettings
        | undefined;
    if (!turnstile?.enabled) return null;
    return turnstile;
}

/**
 * Turnstile verification middleware for Hono
 *
 * Verifies Cloudflare Turnstile tokens for API keys that have opted into bot protection.
 * Only enforces Turnstile for publishable keys (pk_) with turnstile.enabled in metadata.
 *
 * The hostname from Cloudflare's Siteverify response is trustworthy (determined by CF,
 * not the client) and is validated against the API key's allowed hostnames.
 *
 * Usage:
 *   app.use("/api/generate/*", turnstile());
 *
 * API key metadata format:
 *   { turnstile: { enabled: true, hostnames: ["myapp.com", "staging.myapp.com"] } }
 */
export const turnstile = () =>
    createMiddleware<TurnstileEnv>(async (c, next) => {
        const log = c.get("log")?.getChild("turnstile");

        // Initialize turnstile context
        c.set("turnstile", { verified: false });

        // Skip OPTIONS preflight requests
        if (c.req.method === "OPTIONS") {
            return next();
        }

        // Check if API key has Turnstile enabled (opt-in only)
        const apiKey = c.var.auth?.apiKey;
        const turnstileSettings = getTurnstileSettings(apiKey);

        if (!turnstileSettings) {
            // No Turnstile required for this API key
            log?.debug("Turnstile not enabled for this API key");
            return next();
        }

        log?.debug("Turnstile required for API key: {keyId}", {
            keyId: apiKey?.id?.substring(0, 8),
            hostnames: turnstileSettings.hostnames,
        });

        // Get Turnstile token from header
        const token = c.req.header("x-turnstile-token");
        if (!token) {
            log?.warn("Missing Turnstile token for protected API key");
            return c.json(
                {
                    error: "Missing Turnstile token",
                    code: "turnstile_missing",
                    message:
                        "This API key requires Turnstile bot protection. Include X-Turnstile-Token header.",
                },
                403,
            );
        }

        // Get secret key from environment
        const secret = c.env.TURNSTILE_SECRET_KEY;
        if (!secret) {
            log?.error(
                "TURNSTILE_SECRET_KEY not configured but Turnstile is required",
            );
            // Fail closed - don't allow requests if we can't verify
            return c.json(
                {
                    error: "Turnstile verification unavailable",
                    code: "turnstile_config_error",
                },
                500,
            );
        }

        // Get client IP
        const ip = c.req.header("cf-connecting-ip") || "";

        // Verify the token with Cloudflare
        const result = await verifyTurnstile(token, ip, secret);

        if (!result.success) {
            log?.warn("Turnstile verification failed: {codes}", {
                codes: result["error-codes"]?.join(", ") || "unknown",
            });
            return c.json(
                {
                    error: "Invalid Turnstile token",
                    code: "turnstile_invalid",
                    details: result["error-codes"],
                },
                403,
            );
        }

        // Validate hostname against API key's allowed hostnames
        // The hostname from Siteverify is trustworthy (determined by Cloudflare)
        const isTestKey = result.metadata?.result_with_testing_key === true;
        if (!isTestKey && turnstileSettings.hostnames.length > 0) {
            if (
                !result.hostname ||
                !turnstileSettings.hostnames.includes(result.hostname)
            ) {
                log?.warn(
                    "Hostname not in allowed list: {hostname} not in {allowed}",
                    {
                        hostname: result.hostname,
                        allowed: turnstileSettings.hostnames.join(", "),
                    },
                );
                return c.json(
                    {
                        error: "Hostname not allowed for this API key",
                        code: "turnstile_hostname_not_allowed",
                        hostname: result.hostname,
                    },
                    403,
                );
            }
        }

        log?.debug("Turnstile verification successful: {hostname}", {
            hostname: result.hostname,
        });

        // Mark request as verified
        c.set("turnstile", {
            verified: true,
            hostname: result.hostname,
        });

        return next();
    });
