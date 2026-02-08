import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import {
    apikey as apikeyTable,
    user as userTable,
} from "@/db/schema/better-auth.ts";
import type { ApiKeyType } from "@/db/schema/event.ts";
import { tierNames } from "@/tier-config.ts";

// Calculate next tier refill time (midnight UTC) - cron runs daily at 00:00 UTC
function getNextRefillAt(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.toISOString();
}

import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

// Cache TTL in seconds
const CACHE_TTL = 60 * 60; // 1 hour

// CSV escape helper
const escapeCSV = (val: string | number | boolean | null) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

// Query params schema for usage
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce.number().min(1).max(50000).optional().default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
});

// Query params schema for daily usage
const usageDailyQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
});

type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

// Response schema for daily usage OpenAPI documentation
const dailyUsageRecordSchema = z.object({
    date: z.string().describe("Date (YYYY-MM-DD format)"),
    model: z.string().nullable().describe("Model used"),
    meter_source: z
        .string()
        .nullable()
        .describe("Billing source ('tier', 'pack', 'crypto')"),
    requests: z.number().describe("Number of requests"),
    cost_usd: z.number().describe("Total cost in USD"),
});

const dailyUsageResponseSchema = z.object({
    usage: z
        .array(dailyUsageRecordSchema)
        .describe("Array of daily usage records"),
    count: z.number().describe("Number of records returned"),
});

// Response schemas for OpenAPI documentation
const profileResponseSchema = z.object({
    name: z.string().nullable().describe("User's display name"),
    email: z.email().nullable().describe("User's email address"),
    githubUsername: z.string().nullable().describe("GitHub username if linked"),
    image: z
        .string()
        .nullable()
        .describe("Profile picture URL (e.g. GitHub avatar)"),
    tier: z
        .enum(["anonymous", ...tierNames])
        .describe("User's current tier level"),
    createdAt: z.iso
        .datetime()
        .describe("Account creation timestamp (ISO 8601)"),
    nextResetAt: z.iso
        .datetime()
        .nullable()
        .describe("Next daily pollen reset timestamp (ISO 8601)"),
});

const balanceResponseSchema = z.object({
    balance: z
        .number()
        .describe("Total remaining pollen balance (tier + pack combined)"),
    tierBalance: z
        .number()
        .describe("Free daily tier pollen (refills at midnight UTC)"),
    packBalance: z
        .number()
        .describe("Purchased pollen credits (includes crypto balance)"),
});

const usageRecordSchema = z.object({
    timestamp: z
        .string()
        .describe("Request timestamp (YYYY-MM-DD HH:mm:ss format)"),
    type: z
        .string()
        .describe("Request type (e.g., 'generate.image', 'generate.text')"),
    model: z.string().nullable().describe("Model used for generation"),
    api_key: z.string().nullable().describe("API key identifier used (masked)"),
    api_key_type: z
        .string()
        .nullable()
        .describe("Type of API key ('secret', 'publishable')"),
    meter_source: z
        .string()
        .nullable()
        .describe("Billing source ('tier', 'pack', 'crypto')"),
    input_text_tokens: z.number().describe("Number of input text tokens"),
    input_cached_tokens: z.number().describe("Number of cached input tokens"),
    input_audio_tokens: z.number().describe("Number of input audio tokens"),
    input_image_tokens: z.number().describe("Number of input image tokens"),
    output_text_tokens: z.number().describe("Number of output text tokens"),
    output_reasoning_tokens: z
        .number()
        .describe(
            "Number of reasoning tokens (for models with chain-of-thought)",
        ),
    output_audio_tokens: z.number().describe("Number of output audio tokens"),
    output_image_tokens: z
        .number()
        .describe("Number of output image tokens (1 per image)"),
    cost_usd: z.number().describe("Cost in USD for this request"),
    response_time_ms: z
        .number()
        .nullable()
        .describe("Response time in milliseconds"),
});

const usageResponseSchema = z.object({
    usage: z.array(usageRecordSchema).describe("Array of usage records"),
    count: z.number().describe("Number of records returned"),
});

/**
 * Account routes - profile, balance and usage endpoints.
 * Supports both session cookies and API keys with permission checks.
 */
export const accountRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/profile",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get user profile info (name, email, GitHub username, tier, createdAt, nextResetAt). Requires `account:profile` permission for API keys.",
            responses: {
                200: {
                    description:
                        "User profile with name, email, githubUsername, tier, createdAt, nextResetAt",
                    content: {
                        "application/json": {
                            schema: resolver(profileResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:profile` permission",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            // Check permission for API key access
            if (apiKey && !apiKey.permissions?.account?.includes("profile")) {
                throw new HTTPException(403, {
                    message:
                        "API key does not have 'account:profile' permission",
                });
            }

            // Get user profile from D1
            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    name: userTable.name,
                    email: userTable.email,
                    githubUsername: userTable.githubUsername,
                    image: userTable.image,
                    tier: userTable.tier,
                    createdAt: userTable.createdAt,
                    lastTierGrant: userTable.lastTierGrant,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const profile = users[0];
            if (!profile) {
                throw new HTTPException(404, { message: "User not found" });
            }

            // Next reset is always midnight UTC (cron runs daily)
            const nextResetAt = getNextRefillAt();

            return c.json({
                name: profile.name,
                email: profile.email,
                githubUsername: profile.githubUsername ?? null,
                image: profile.image ?? null,
                tier: profile.tier,
                createdAt: profile.createdAt,
                nextResetAt,
            });
        },
    )
    .get(
        "/balance",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get pollen balance. Returns the key's remaining budget if set, otherwise the user's total balance. Requires `account:balance` permission for API keys.",
            responses: {
                200: {
                    description: "Balance (remaining pollen)",
                    content: {
                        "application/json": {
                            schema: resolver(balanceResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:balance` permission",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            // Check permission for API key access
            if (apiKey && !apiKey.permissions?.account?.includes("balance")) {
                throw new HTTPException(403, {
                    message:
                        "API key does not have 'account:balance' permission",
                });
            }

            // If API key has a budget, return that (no breakdown available)
            if (apiKey?.pollenBalance != null) {
                return c.json({
                    balance: apiKey.pollenBalance,
                    tierBalance: 0,
                    packBalance: apiKey.pollenBalance,
                });
            }

            // Otherwise return user's balance with breakdown
            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    packBalance: userTable.packBalance,
                    cryptoBalance: userTable.cryptoBalance,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const tierBalance = users[0]?.tierBalance ?? 0;
            const packBalance =
                (users[0]?.packBalance ?? 0) + (users[0]?.cryptoBalance ?? 0);

            return c.json({
                balance: tierBalance + packBalance,
                tierBalance,
                packBalance,
            });
        },
    )
    .get(
        "/usage",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get request history and spending data. Supports JSON and CSV formats. Requires `account:usage` permission for API keys.",
            responses: {
                200: {
                    description:
                        "Usage records with timestamp, model, tokens, cost_usd, etc.",
                    content: {
                        "application/json": {
                            schema: resolver(usageResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            // Check permission for API key access
            if (apiKey && !apiKey.permissions?.account?.includes("usage")) {
                throw new HTTPException(403, {
                    message: "API key does not have 'account:usage' permission",
                });
            }

            const { format, limit, before } = c.req.valid("query");

            log.debug(
                "Fetching usage: userId={userId} format={format} limit={limit} before={before}",
                {
                    userId: user.id,
                    format,
                    limit,
                    before,
                },
            );

            // Build Tinybird API URL from ingest URL origin
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdUrl = new URL(
                "/v0/pipes/user_usage.json",
                tinybirdOrigin,
            );
            tinybirdUrl.searchParams.set("user_id", user.id);
            tinybirdUrl.searchParams.set("limit", limit.toString());
            if (before) {
                tinybirdUrl.searchParams.set("before", before);
            }

            log.debug("Querying Tinybird: {url}", {
                url: tinybirdUrl.toString(),
            });

            try {
                const response = await fetch(tinybirdUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${c.env.TINYBIRD_READ_TOKEN}`,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    log.error(
                        "Tinybird error: url={url} status={status} error={error}",
                        {
                            url: tinybirdUrl.toString(),
                            status: response.status,
                            error: errorText,
                        },
                    );

                    const status = response.status >= 500 ? 503 : 500;
                    return c.json(
                        {
                            error: "Failed to fetch usage data",
                            details:
                                response.status === 401
                                    ? "Unauthorized"
                                    : "Service Unavailable",
                        },
                        status,
                    );
                }

                const data = (await response.json()) as {
                    data: Array<{
                        timestamp: string;
                        type: string;
                        model: string | null;
                        api_key: string | null;
                        api_key_type: string | null;
                        meter_source: string | null;
                        input_text_tokens: number;
                        input_cached_tokens: number;
                        input_audio_tokens: number;
                        input_image_tokens: number;
                        output_text_tokens: number;
                        output_reasoning_tokens: number;
                        output_audio_tokens: number;
                        output_image_tokens: number;
                        cost_usd: number;
                        response_time_ms: number | null;
                    }>;
                };

                const usage = data.data;

                log.debug("Fetched {count} usage records", {
                    count: usage.length,
                });

                // Return CSV if requested
                if (format === "csv") {
                    const header =
                        "timestamp,type,model,api_key,api_key_type,meter_source,input_text_tokens,input_cached_tokens,input_audio_tokens,input_image_tokens,output_text_tokens,output_reasoning_tokens,output_audio_tokens,output_image_tokens,cost_usd,response_time_ms";
                    const rows = usage.map(
                        (row) =>
                            `${escapeCSV(row.timestamp)},${escapeCSV(row.type)},${escapeCSV(row.model)},${escapeCSV(row.api_key)},${escapeCSV(row.api_key_type)},${escapeCSV(row.meter_source)},${row.input_text_tokens},${row.input_cached_tokens},${row.input_audio_tokens},${row.input_image_tokens},${row.output_text_tokens},${row.output_reasoning_tokens},${row.output_audio_tokens},${row.output_image_tokens},${row.cost_usd},${row.response_time_ms || ""}`,
                    );
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json({
                    usage,
                    count: usage.length,
                });
            } catch (error) {
                log.error("Error fetching usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    )
    .get(
        "/usage/daily",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get daily aggregated usage data (last 90 days). Supports JSON and CSV formats. Requires `account:usage` permission for API keys. Results are cached for 1 hour.",
            responses: {
                200: {
                    description: "Daily usage records aggregated by date/model",
                    content: {
                        "application/json": {
                            schema: resolver(dailyUsageResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key missing `account:usage` permission",
                },
            },
        }),
        validator("query", usageDailyQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage-daily");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            if (apiKey && !apiKey.permissions?.account?.includes("usage")) {
                throw new HTTPException(403, {
                    message: "API key does not have 'account:usage' permission",
                });
            }

            const userId = user.id;
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = c.env.TINYBIRD_READ_TOKEN;
            const kv = c.env.KV;
            const cacheKey = `usage:daily:${userId}`;

            try {
                let usage: DailyUsageRecord[] | null = null;
                let cached = false;

                try {
                    const cachedData = await kv.get(cacheKey, "json");
                    if (cachedData) {
                        usage = cachedData as DailyUsageRecord[];
                        cached = true;
                    }
                } catch (err) {
                    log.trace("KV get error: {err}", { err });
                }

                if (!usage) {
                    const ninetyDaysAgo = new Date(
                        Date.now() - 90 * 24 * 60 * 60 * 1000,
                    );
                    const since = `${ninetyDaysAgo.toISOString().split("T")[0]} 00:00:00`;

                    const url = new URL(
                        "/v0/pipes/user_usage_daily.json",
                        tinybirdOrigin,
                    );
                    url.searchParams.set("user_id", userId);
                    url.searchParams.set("since", since);

                    const response = await fetch(url.toString(), {
                        headers: {
                            Authorization: `Bearer ${tinybirdToken}`,
                        },
                    });

                    if (!response.ok) {
                        throw new Error(`Tinybird error: ${response.status}`);
                    }

                    const data = (await response.json()) as {
                        data: DailyUsageRecord[];
                    };
                    usage = data.data;

                    try {
                        await kv.put(cacheKey, JSON.stringify(usage), {
                            expirationTtl: CACHE_TTL,
                        });
                    } catch (err) {
                        log.trace("KV put error: {err}", { err });
                    }
                }

                log.debug(
                    "Fetched daily usage: count={count} cached={cached}",
                    { count: usage.length, cached },
                );

                const { format } = c.req.valid("query");

                if (format === "csv") {
                    const header = "date,model,meter_source,requests,cost_usd";
                    const rows = usage.map(
                        (row) =>
                            `${escapeCSV(row.date)},${escapeCSV(row.model)},${escapeCSV(row.meter_source)},${row.requests},${row.cost_usd}`,
                    );
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-daily-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json({
                    usage,
                    count: usage.length,
                });
            } catch (error) {
                log.error("Error fetching daily usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    )
    .get(
        "/key",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get API key status and information. Returns key validity, type, expiry, permissions, and remaining budget. This endpoint allows validating keys without making expensive generation requests. Requires API key authentication.",
            responses: {
                200: {
                    description: "API key status and information",
                    content: {
                        "application/json": {
                            schema: resolver(
                                z.object({
                                    valid: z
                                        .boolean()
                                        .describe(
                                            "Whether the API key is valid and active",
                                        ),
                                    type: z
                                        .enum(["publishable", "secret"])
                                        .describe("Type of API key"),
                                    name: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Display name of the API key",
                                        ),
                                    expiresAt: z
                                        .string()
                                        .nullable()
                                        .describe(
                                            "Expiry timestamp in ISO 8601 format, null if never expires",
                                        ),
                                    expiresIn: z
                                        .number()
                                        .nullable()
                                        .describe(
                                            "Seconds until expiry, null if never expires",
                                        ),
                                    permissions: z
                                        .object({
                                            models: z
                                                .array(z.string())
                                                .nullable()
                                                .describe(
                                                    "List of allowed model IDs, null = all models allowed",
                                                ),
                                            account: z
                                                .array(z.string())
                                                .nullable()
                                                .describe(
                                                    "List of account permissions, null = no account access",
                                                ),
                                        })
                                        .describe("API key permissions"),
                                    pollenBudget: z
                                        .number()
                                        .nullable()
                                        .describe(
                                            "Remaining pollen budget for this key, null = unlimited (uses user balance)",
                                        ),
                                    rateLimitEnabled: z
                                        .boolean()
                                        .describe(
                                            "Whether rate limiting is enabled for this key",
                                        ),
                                }),
                            ),
                        },
                    },
                },
                401: {
                    description: "Invalid or missing API key",
                },
            },
        }),
        async (c) => {
            const log = c.get("log").getChild("account-key");

            // This endpoint requires API key authentication
            const apiKey = c.var.auth.apiKey;
            if (!apiKey) {
                log.debug("No API key provided");
                throw new HTTPException(401, {
                    message:
                        "API key required. This endpoint validates API keys.",
                });
            }

            log.debug("Returning status for API key: {keyId}", {
                keyId: apiKey.id,
            });

            // Get key type from metadata (set at key creation time)
            const keyType: ApiKeyType =
                (apiKey.metadata?.keyType as ApiKeyType) || "secret";

            // Fetch additional key details from DB
            const db = drizzle(c.env.DB);
            const keyDetails = await db
                .select({
                    expiresAt: apikeyTable.expiresAt,
                    rateLimitEnabled: apikeyTable.rateLimitEnabled,
                })
                .from(apikeyTable)
                .where(eq(apikeyTable.id, apiKey.id))
                .get();

            let expiresAt: string | null = null;
            let expiresIn: number | null = null;

            if (keyDetails?.expiresAt) {
                // Convert timestamp to ISO string
                const expiryDate = new Date(keyDetails.expiresAt);
                expiresAt = expiryDate.toISOString();

                // Calculate seconds until expiry
                const now = Date.now();
                const msUntilExpiry = expiryDate.getTime() - now;

                if (msUntilExpiry > 0) {
                    expiresIn = Math.floor(msUntilExpiry / 1000);
                } else {
                    // Key is already expired
                    expiresIn = 0;
                }
            }

            // Format permissions for response
            const permissions = {
                models: apiKey.permissions?.models || null,
                account: apiKey.permissions?.account || null,
            };

            return c.json({
                valid: true, // If we got here, the key is valid
                type: keyType,
                name: apiKey.name || null,
                expiresAt,
                expiresIn,
                permissions,
                pollenBudget: apiKey.pollenBalance ?? null,
                rateLimitEnabled: keyDetails?.rateLimitEnabled ?? true,
            });
        },
    );

export default accountRoutes;
