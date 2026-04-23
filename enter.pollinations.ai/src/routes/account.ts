import { and, eq } from "drizzle-orm";
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
import { sanitizeAuthorizeAccountPermissions } from "../client/lib/authorize-config.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import { parseMetadata } from "./metadata-utils.ts";

// Cache TTL in seconds
const CACHE_TTL = 60 * 60; // 1 hour
const DEFAULT_USAGE_DAYS = 30;
const DEFAULT_DAILY_USAGE_DAYS = 90;
const MAX_USAGE_DAYS = 90;
const USAGE_CHUNK_DAYS = 30;
const MAX_USAGE_EXPORT_ROWS = 50_000;

const SECONDS_PER_DAY = 86400;

type UsageDebugBindings = CloudflareBindings & {
    USAGE_DEBUG_USER_ID?: string;
};

function resolveUsageTargetUserId(
    env: CloudflareBindings,
    currentUserId: string,
    apiKey?: {
        permissions?: Record<string, string[]>;
        metadata?: Record<string, unknown>;
    },
): { userId: string; overridden: boolean } {
    if (apiKey) {
        return { userId: currentUserId, overridden: false };
    }

    const environment = String(env.ENVIRONMENT || "");
    const allowDebugOverride =
        environment === "local" ||
        environment === "development" ||
        environment === "dev";

    if (!allowDebugOverride) {
        return { userId: currentUserId, overridden: false };
    }

    const debugUserId = (env as UsageDebugBindings).USAGE_DEBUG_USER_ID?.trim();
    if (!debugUserId) {
        return { userId: currentUserId, overridden: false };
    }

    return {
        userId: debugUserId,
        overridden: debugUserId !== currentUserId,
    };
}

/**
 * Require that the caller has `account:keys` permission and is using a secret key.
 * Session-authenticated users (no apiKey) are always allowed.
 */
function requireKeysPermission(apiKey?: {
    permissions?: Record<string, string[]>;
    metadata?: Record<string, unknown>;
}): void {
    if (!apiKey) return; // session auth — always allowed
    const keyType = (apiKey.metadata?.keyType as string) || "secret";
    if (keyType !== "secret") {
        throw new HTTPException(403, {
            message: "Only secret keys (sk_) can manage API keys",
        });
    }
    if (!apiKey.permissions?.account?.includes("keys")) {
        throw new HTTPException(403, {
            message: "API key does not have 'account:keys' permission",
        });
    }
}

// Schema for creating an API key via the API
const CreateKeySchema = z.object({
    name: z.string().min(1).max(253).describe("Name for the API key"),
    type: z
        .enum(["secret", "publishable"])
        .optional()
        .default("secret")
        .describe("Key type: secret (sk_) or publishable (pk_)"),
    expiresIn: z
        .number()
        .int()
        .positive()
        .max(365 * SECONDS_PER_DAY)
        .optional()
        .describe("Expiry in seconds from now (max 365 days)"),
    allowedModels: z
        .array(z.string())
        .nullable()
        .optional()
        .describe("Model IDs this key can access. null = all models"),
    pollenBudget: z
        .number()
        .nullable()
        .optional()
        .describe("Pollen budget cap. null = unlimited"),
    accountPermissions: z
        .array(z.string())
        .nullable()
        .optional()
        .describe(
            'Account permissions (e.g. ["usage"]). "keys" is auto-stripped.',
        ),
});

// CSV escape helper
const escapeCSV = (val: string | number | boolean | null) => {
    if (val === null || val === undefined) return "";
    const str = String(val);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

function formatTinybirdDateTime(date: Date): string {
    return date.toISOString().slice(0, 19).replace("T", " ");
}

function startOfNextUtcDay(now = new Date()): Date {
    const next = new Date(now);
    next.setUTCHours(0, 0, 0, 0);
    next.setUTCDate(next.getUTCDate() + 1);
    return next;
}

function addUtcDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
}

type UsageWindow = {
    since: string;
    until: string;
};

function buildUsageWindow(days: number): UsageWindow {
    const untilDate = startOfNextUtcDay();
    const sinceDate = addUtcDays(untilDate, -days);
    return {
        since: formatTinybirdDateTime(sinceDate),
        until: formatTinybirdDateTime(untilDate),
    };
}

function buildUsageWindows(
    days: number,
    chunkDays = USAGE_CHUNK_DAYS,
    newestFirst = false,
): UsageWindow[] {
    const overallWindow = buildUsageWindow(days);
    const windows: UsageWindow[] = [];
    let cursor = new Date(`${overallWindow.since.replace(" ", "T")}Z`);
    const end = new Date(`${overallWindow.until.replace(" ", "T")}Z`);

    while (cursor < end) {
        const next = addUtcDays(cursor, chunkDays);
        const boundedNext = next < end ? next : end;
        windows.push({
            since: formatTinybirdDateTime(cursor),
            until: formatTinybirdDateTime(boundedNext),
        });
        cursor = boundedNext;
    }

    return newestFirst ? windows.reverse() : windows;
}

async function fetchTinybirdRows<T>(
    origin: string,
    path: string,
    token: string,
    params: Record<string, string | undefined>,
): Promise<T[]> {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(params)) {
        if (value) {
            url.searchParams.set(key, value);
        }
    }

    const response = await fetch(url.toString(), {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
            `Tinybird error: ${response.status} ${errorText || "(empty response)"}`,
        );
    }

    const data = (await response.json()) as { data: T[] };
    return data.data;
}

// Query params schema for usage
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce
        .number()
        .min(1)
        .max(MAX_USAGE_EXPORT_ROWS)
        .optional()
        .default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
    days: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_USAGE_DAYS)
        .optional()
        .default(DEFAULT_USAGE_DAYS),
});

// Query params schema for daily usage
const usageDailyQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    days: z.coerce
        .number()
        .int()
        .min(1)
        .max(MAX_USAGE_DAYS)
        .optional()
        .default(DEFAULT_DAILY_USAGE_DAYS),
    api_key_ids: z
        .string()
        .optional()
        .transform((value) =>
            value
                ? Array.from(
                      new Set(
                          value
                              .split(",")
                              .map((id) => id.trim())
                              .filter((id) => id.length > 0),
                      ),
                  ).sort()
                : [],
        ),
});

type DailyUsageRecord = {
    date: string;
    model: string | null;
    meter_source: string | null;
    requests: number;
    cost_usd: number;
};

type UsageRecord = {
    timestamp: string;
    type: string;
    model: string | null;
    api_key_id: string | null;
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
};

type UsageRecordWithCursor = UsageRecord & {
    cursor_event_id: string;
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

function sortDailyUsageRecords(usage: DailyUsageRecord[]): DailyUsageRecord[] {
    return usage.toSorted((left, right) => {
        if (left.date !== right.date) {
            return right.date.localeCompare(left.date);
        }
        if (right.requests !== left.requests) {
            return right.requests - left.requests;
        }
        if ((left.model || "") !== (right.model || "")) {
            return (left.model || "").localeCompare(right.model || "");
        }
        return (left.meter_source || "").localeCompare(
            right.meter_source || "",
        );
    });
}

function usageRecordToCsvRow(row: UsageRecord): string {
    return `${escapeCSV(row.timestamp)},${escapeCSV(row.type)},${escapeCSV(row.model)},${escapeCSV(row.api_key)},${escapeCSV(row.api_key_type)},${escapeCSV(row.meter_source)},${row.input_text_tokens},${row.input_cached_tokens},${row.input_audio_tokens},${row.input_image_tokens},${row.output_text_tokens},${row.output_reasoning_tokens},${row.output_audio_tokens},${row.output_image_tokens},${row.cost_usd},${escapeCSV(row.response_time_ms)}`;
}

function dailyUsageRecordToCsvRow(row: DailyUsageRecord): string {
    return `${escapeCSV(row.date)},${escapeCSV(row.model)},${escapeCSV(row.meter_source)},${row.requests},${row.cost_usd}`;
}

async function fetchDetailedUsagePage(
    origin: string,
    token: string,
    params: {
        userId: string;
        apiKeyId?: string;
        limit: number;
        since: string;
        until: string;
        before?: string;
        beforeEventId?: string;
    },
): Promise<UsageRecordWithCursor[]> {
    return fetchTinybirdRows<UsageRecordWithCursor>(
        origin,
        "/v0/pipes/user_usage.json",
        token,
        {
            user_id: params.userId,
            api_key_id: params.apiKeyId,
            limit: params.limit.toString(),
            since: params.since,
            until: params.until,
            before: params.before,
            before_event_id: params.beforeEventId,
        },
    );
}

function stripUsageCursor(row: UsageRecordWithCursor): UsageRecord {
    const { cursor_event_id: _, ...usage } = row;
    return usage;
}

// Response schemas for OpenAPI documentation
const profileResponseSchema = z.object({
    githubUsername: z.string().nullable().describe("GitHub username if linked"),
    image: z
        .string()
        .nullable()
        .describe("Profile picture URL (e.g. GitHub avatar)"),
    name: z
        .string()
        .nullable()
        .optional()
        .describe(
            "User's display name (only returned when the key has `account:profile`)",
        ),
    email: z
        .email()
        .nullable()
        .optional()
        .describe(
            "User's email address (only returned when the key has `account:profile`)",
        ),
});

const balanceResponseSchema = z.object({
    balance: z
        .number()
        .describe(
            "Remaining pollen balance (combines tier, pack, and crypto balances)",
        ),
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
            tags: ["👤 Account"],
            summary: "Get Profile",
            description:
                "Returns your account profile. GitHub username and profile image are always returned. Name and email are returned only when the API key has the `account:profile` permission.",
            responses: {
                200: {
                    description: "User profile",
                    content: {
                        "application/json": {
                            schema: resolver(profileResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;
            const includeProfilePII =
                !apiKey || !!apiKey.permissions?.account?.includes("profile");

            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    githubUsername: userTable.githubUsername,
                    image: userTable.image,
                    name: userTable.name,
                    email: userTable.email,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const profile = users[0];
            if (!profile) {
                throw new HTTPException(404, { message: "User not found" });
            }

            return c.json({
                githubUsername: profile.githubUsername ?? null,
                image: profile.image ?? null,
                ...(includeProfilePII && {
                    name: profile.name ?? null,
                    email: profile.email ?? null,
                }),
            });
        },
    )
    .get(
        "/balance",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Balance",
            description:
                "Returns the pollen balance visible to the caller. API keys with a budget always see their remaining budget (no scope needed). Session auth or API keys with the `account:usage` scope see the full account balance.",
            responses: {
                200: {
                    description: "Pollen balance",
                    content: {
                        "application/json": {
                            schema: resolver(balanceResponseSchema),
                        },
                    },
                },
                401: { description: "Unauthorized" },
                403: {
                    description:
                        "Permission denied - API key has no budget and is missing the `account:usage` scope",
                },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const apiKey = c.var.auth.apiKey;

            // Keys with a budget always see their own budget — no scope needed.
            if (apiKey?.pollenBalance != null) {
                return c.json({ balance: apiKey.pollenBalance });
            }

            // Beyond that, reading account balance requires the `usage` scope.
            if (apiKey && !apiKey.permissions?.account?.includes("usage")) {
                throw new HTTPException(403, {
                    message:
                        "API key does not have 'account:usage' scope and no budget of its own. Add `account:usage` to read account balance, or set a budget on the key.",
                });
            }

            const db = drizzle(c.env.DB);
            const users = await db
                .select({
                    tierBalance: userTable.tierBalance,
                    creatorBalance: userTable.creatorBalance,
                    packBalance: userTable.packBalance,
                    cryptoBalance: userTable.cryptoBalance,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const tierBalance = users[0]?.tierBalance ?? 0;
            const creatorBalance = users[0]?.creatorBalance ?? 0;
            const packBalance = users[0]?.packBalance ?? 0;
            const cryptoBalance = users[0]?.cryptoBalance ?? 0;

            // Clamp each bucket at 0 before summing — individual buckets can go negative
            // from overage but shouldn't reduce the visible total
            return c.json({
                balance:
                    Math.max(0, tierBalance) +
                    Math.max(0, creatorBalance) +
                    Math.max(0, packBalance) +
                    Math.max(0, cryptoBalance),
            });
        },
    )
    .get(
        "/usage",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get Usage History",
            description:
                "Returns your request history with per-request details: model used, token counts, cost, and response time. Defaults to the last 30 days, supports up to 90 days via `days`, and supports JSON and CSV export. Each response is capped at 50,000 rows. Use `before` for cursor-based pagination. Requires `account:usage` permission when using API keys.",
            responses: {
                200: {
                    description: "Usage records",
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

            const { format, limit, before, days } = c.req.valid("query");
            const { userId: usageUserId, overridden: usageUserOverridden } =
                resolveUsageTargetUserId(c.env, user.id, apiKey);
            const usageWindow = buildUsageWindow(days);
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = c.env.TINYBIRD_READ_TOKEN;
            const header =
                "timestamp,type,model,api_key,api_key_type,meter_source,input_text_tokens,input_cached_tokens,input_audio_tokens,input_image_tokens,output_text_tokens,output_reasoning_tokens,output_audio_tokens,output_image_tokens,cost_usd,response_time_ms";

            log.debug(
                "Fetching usage: requesterUserId={requesterUserId} targetUserId={targetUserId} override={override} format={format} limit={limit} before={before} days={days}",
                {
                    requesterUserId: user.id,
                    targetUserId: usageUserId,
                    override: usageUserOverridden,
                    format,
                    limit,
                    before,
                    days,
                },
            );

            try {
                const usage = (
                    await fetchDetailedUsagePage(
                        tinybirdOrigin,
                        tinybirdToken,
                        {
                            userId: usageUserId,
                            limit,
                            since: usageWindow.since,
                            until: usageWindow.until,
                            before,
                        },
                    )
                ).map(stripUsageCursor);

                log.debug("Fetched {count} usage records", {
                    count: usage.length,
                });

                // Return CSV if requested
                if (format === "csv") {
                    const rows = usage.map(usageRecordToCsvRow);
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-latest-${usage.length}-rows-${days}d-${new Date().toISOString().split("T")[0]}.csv"`,
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
            tags: ["👤 Account"],
            summary: "Get Daily Usage",
            description:
                "Returns daily aggregated usage for the requested time window (max 90 days), grouped by date and model. Useful for dashboards and spending analysis. Supports JSON and CSV export. Results are cached for 1 hour. Requires `account:usage` permission when using API keys.",
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

            const {
                format,
                days,
                api_key_ids: apiKeyIds,
            } = c.req.valid("query");
            const { userId: usageUserId, overridden: usageUserOverridden } =
                resolveUsageTargetUserId(c.env, user.id, apiKey);
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = c.env.TINYBIRD_READ_TOKEN;
            const kv = c.env.KV;
            const cacheKeyPrefix = usageUserOverridden
                ? `usage:daily:debug:${usageUserId}`
                : `usage:daily:${usageUserId}`;
            const cacheKey = `${cacheKeyPrefix}:${days}:${apiKeyIds.length > 0 ? `keys:${apiKeyIds.join(",")}` : "all"}`;
            const windows = buildUsageWindows(days);

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
                    const chunkResults = await Promise.all(
                        windows.map((window) =>
                            fetchTinybirdRows<DailyUsageRecord>(
                                tinybirdOrigin,
                                "/v0/pipes/user_usage_daily_filtered.json",
                                tinybirdToken,
                                {
                                    user_id: usageUserId,
                                    since: window.since,
                                    until: window.until,
                                    api_key_ids:
                                        apiKeyIds.length > 0
                                            ? apiKeyIds.join(",")
                                            : undefined,
                                },
                            ),
                        ),
                    );
                    usage = sortDailyUsageRecords(chunkResults.flat());

                    try {
                        await kv.put(cacheKey, JSON.stringify(usage), {
                            expirationTtl: CACHE_TTL,
                        });
                    } catch (err) {
                        log.trace("KV put error: {err}", { err });
                    }
                }

                log.debug(
                    "Fetched daily usage: requesterUserId={requesterUserId} targetUserId={targetUserId} override={override} days={days} apiKeyIds={apiKeyIds} count={count} cached={cached}",
                    {
                        requesterUserId: user.id,
                        targetUserId: usageUserId,
                        override: usageUserOverridden,
                        days,
                        apiKeyIds,
                        count: usage.length,
                        cached,
                    },
                );

                if (format === "csv") {
                    const header = "date,model,meter_source,requests,cost_usd";
                    const rows = usage.map(dailyUsageRecordToCsvRow);
                    const csv = [header, ...rows].join("\n");

                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-usage-daily-${days}d-${new Date().toISOString().split("T")[0]}.csv"`,
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
        "/keys",
        describeRoute({
            tags: ["👤 Account"],
            summary: "List API Keys",
            description:
                "List all API keys for the current user. Requires `account:keys` permission when using API keys. Secret key values are never returned.",
            responses: {
                200: { description: "List of API keys" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            requireKeysPermission(c.var.auth.apiKey);

            const db = drizzle(c.env.DB);
            const keys = await db
                .select({
                    id: apikeyTable.id,
                    name: apikeyTable.name,
                    start: apikeyTable.start,
                    prefix: apikeyTable.prefix,
                    createdAt: apikeyTable.createdAt,
                    expiresAt: apikeyTable.expiresAt,
                    lastRequest: apikeyTable.lastRequest,
                    permissions: apikeyTable.permissions,
                    metadata: apikeyTable.metadata,
                    pollenBalance: apikeyTable.pollenBalance,
                    enabled: apikeyTable.enabled,
                })
                .from(apikeyTable)
                .where(eq(apikeyTable.userId, user.id))
                .all();

            c.header("Cache-Control", "private, no-store, max-age=0");
            return c.json({
                data: keys.map((key) => ({
                    id: key.id,
                    name: key.name,
                    start: key.start,
                    prefix: key.prefix,
                    createdAt: key.createdAt,
                    expiresAt: key.expiresAt,
                    lastRequest: key.lastRequest,
                    permissions: key.permissions
                        ? (() => {
                              try {
                                  return JSON.parse(key.permissions);
                              } catch {
                                  return null;
                              }
                          })()
                        : null,
                    metadata: parseMetadata(key.metadata),
                    pollenBalance: key.pollenBalance,
                    enabled: key.enabled,
                })),
            });
        },
    )
    .post(
        "/keys",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Create API Key",
            description:
                "Create a new API key. Requires `account:keys` permission and a secret key (sk_). The full key value is returned only once in the response. The `keys` account permission is automatically stripped from child keys to prevent escalation.",
            responses: {
                200: { description: "Created API key with full secret" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied or publishable key" },
            },
        }),
        validator("json", CreateKeySchema),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            requireKeysPermission(c.var.auth.apiKey);

            const {
                name,
                type,
                expiresIn,
                allowedModels,
                pollenBudget,
                accountPermissions,
            } = c.req.valid("json");

            const isPublishable = type === "publishable";
            const prefix = isPublishable ? "pk" : "sk";

            // Whitelist to known scopes (drops unknown / legacy names like "balance").
            // Then strip "keys" to prevent escalation via the BYOP flow.
            const safeAccountPerms =
                sanitizeAuthorizeAccountPermissions(accountPermissions)?.filter(
                    (p) => p !== "keys",
                ) ?? null;

            // Build permissions object
            const permissions: Record<string, string[]> = {};
            if (allowedModels) permissions.models = allowedModels;
            if (safeAccountPerms && safeAccountPerms.length > 0)
                permissions.account = safeAccountPerms;

            // Create key via better-auth server API (no session needed when passing userId)
            const authClient = c.var.auth.client;
            const created = await authClient.api.createApiKey({
                body: {
                    name,
                    prefix,
                    userId: user.id,
                    ...(expiresIn != null && { expiresIn }),
                    metadata: {
                        keyType: type,
                        createdVia: "api",
                    },
                    permissions:
                        Object.keys(permissions).length > 0
                            ? permissions
                            : undefined,
                },
            });

            if (!created?.id || !created?.key) {
                throw new HTTPException(500, {
                    message: "Failed to create API key",
                });
            }

            const db = drizzle(c.env.DB);

            // Set D1 custom fields (pollenBudget, publishable plaintext)
            const d1Updates: Record<string, unknown> = {};
            if (pollenBudget != null) d1Updates.pollenBalance = pollenBudget;
            if (isPublishable) {
                d1Updates.metadata = JSON.stringify({
                    keyType: type,
                    createdVia: "api",
                    plaintextKey: created.key,
                });
            }

            if (Object.keys(d1Updates).length > 0) {
                await db
                    .update(apikeyTable)
                    .set(d1Updates)
                    .where(eq(apikeyTable.id, created.id));
            }

            return c.json({
                id: created.id,
                key: created.key,
                name: created.name,
                type,
                prefix,
                start: created.start,
                expiresAt: created.expiresAt,
                permissions:
                    Object.keys(permissions).length > 0 ? permissions : null,
                pollenBudget: pollenBudget ?? null,
            });
        },
    )
    .delete(
        "/keys/:id",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Revoke API Key",
            description:
                "Delete/revoke an API key. Requires `account:keys` permission and a secret key (sk_). Cannot revoke the key used to authenticate the request.",
            responses: {
                200: { description: "Key revoked" },
                400: { description: "Cannot revoke self" },
                401: { description: "Unauthorized" },
                403: { description: "Permission denied" },
                404: { description: "Key not found" },
            },
        }),
        async (c) => {
            await c.var.auth.requireAuthorization();
            const user = c.var.auth.requireUser();
            const callerKey = c.var.auth.apiKey;
            requireKeysPermission(callerKey);

            const { id } = c.req.param();

            // Prevent self-revocation
            if (callerKey && callerKey.id === id) {
                throw new HTTPException(400, {
                    message:
                        "Cannot revoke the API key used to authenticate this request",
                });
            }

            const db = drizzle(c.env.DB);
            const key = await db
                .select()
                .from(apikeyTable)
                .where(
                    and(
                        eq(apikeyTable.id, id),
                        eq(apikeyTable.userId, user.id),
                    ),
                )
                .get();

            if (!key) {
                throw new HTTPException(404, { message: "API key not found" });
            }

            await db.delete(apikeyTable).where(eq(apikeyTable.id, id));

            return c.json({ success: true });
        },
    )
    .get(
        "/key",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get API Key Info",
            description:
                "Returns information about the API key used in the request: validity, type (secret/publishable), expiry, permissions, and remaining budget. Useful for validating keys without making generation requests.",
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
                // Rate limiting applies to publishable keys only (see rate-limit-durable.ts)
                rateLimitEnabled: keyType === "publishable",
            });
        },
    )
    .get(
        "/key/usage",
        describeRoute({
            tags: ["👤 Account"],
            summary: "Get API Key Usage",
            description:
                "Returns usage history for the API key used in the request. No scope required — a key can always read its own usage. For account-wide usage across all keys, use `/account/usage` with the `account:usage` scope.",
            responses: {
                200: {
                    description: "Usage records for this key",
                    content: {
                        "application/json": {
                            schema: resolver(usageResponseSchema),
                        },
                    },
                },
                401: {
                    description:
                        "API key required (this endpoint is key-auth only)",
                },
            },
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("key-usage");
            const apiKey = c.var.auth.apiKey;
            if (!apiKey) {
                throw new HTTPException(401, {
                    message:
                        "API key required. This endpoint is authenticated by API key only.",
                });
            }
            const user = c.var.auth.requireUser();

            const { format, limit, before, days } = c.req.valid("query");
            const usageWindow = buildUsageWindow(days);
            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdToken = c.env.TINYBIRD_READ_TOKEN;
            const header =
                "timestamp,type,model,api_key,api_key_type,meter_source,input_text_tokens,input_cached_tokens,input_audio_tokens,input_image_tokens,output_text_tokens,output_reasoning_tokens,output_audio_tokens,output_image_tokens,cost_usd,response_time_ms";

            log.debug(
                "Fetching key usage: userId={userId} keyId={keyId} days={days}",
                { userId: user.id, keyId: apiKey.id, days },
            );

            try {
                const usage = (
                    await fetchDetailedUsagePage(
                        tinybirdOrigin,
                        tinybirdToken,
                        {
                            userId: user.id,
                            apiKeyId: apiKey.id,
                            limit,
                            since: usageWindow.since,
                            until: usageWindow.until,
                            before,
                        },
                    )
                ).map(stripUsageCursor);

                if (format === "csv") {
                    const rows = usage.map(usageRecordToCsvRow);
                    const csv = [header, ...rows].join("\n");
                    return new Response(csv, {
                        headers: {
                            "Content-Type": "text/csv",
                            "Content-Disposition": `attachment; filename="pollinations-key-usage-${usage.length}-rows-${days}d-${new Date().toISOString().split("T")[0]}.csv"`,
                        },
                    });
                }

                return c.json({ usage, count: usage.length });
            } catch (error) {
                log.error("Error fetching key usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    );

export default accountRoutes;
