import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { describeRoute, resolver } from "hono-openapi";
import { z } from "zod";
import { user as userTable } from "@/db/schema/better-auth.ts";
import type { Env } from "../env.ts";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";

// Query params schema for usage
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce.number().min(1).max(10000).optional().default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
});

// Response schemas for OpenAPI documentation
const profileResponseSchema = z.object({
    name: z.string().nullable().describe("User's display name"),
    email: z.string().email().nullable().describe("User's email address"),
    githubUsername: z.string().nullable().describe("GitHub username if linked"),
    tier: z
        .enum(["anonymous", "seed", "flower", "nectar"])
        .describe("User's current tier level"),
    createdAt: z
        .string()
        .datetime()
        .describe("Account creation timestamp (ISO 8601)"),
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
        .describe("Type of API key ('secret', 'publishable', 'temporary')"),
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
                "Get user profile info (name, email, GitHub username, tier). Requires `account:profile` permission for API keys.",
            responses: {
                200: {
                    description:
                        "User profile with name, email, githubUsername, tier, createdAt",
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
                    tier: userTable.tier,
                    createdAt: userTable.createdAt,
                })
                .from(userTable)
                .where(eq(userTable.id, user.id))
                .limit(1);

            const profile = users[0];
            if (!profile) {
                throw new HTTPException(404, { message: "User not found" });
            }

            return c.json({
                name: profile.name,
                email: profile.email,
                githubUsername: profile.githubUsername ?? null,
                tier: profile.tier,
                createdAt: profile.createdAt,
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

            // If API key has a budget, return that
            if (
                apiKey?.pollenBalance !== null &&
                apiKey?.pollenBalance !== undefined
            ) {
                return c.json({ balance: apiKey.pollenBalance });
            }

            // Otherwise return user's total balance
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
            const packBalance = users[0]?.packBalance ?? 0;
            const cryptoBalance = users[0]?.cryptoBalance ?? 0;

            return c.json({
                balance: tierBalance + packBalance + cryptoBalance,
            });
        },
    )
    .get(
        "/usage",
        describeRoute({
            tags: ["gen.pollinations.ai"],
            description:
                "Get request history and spending data from Tinybird. Supports JSON and CSV formats. Requires `account:usage` permission for API keys.",
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
            tinybirdUrl.searchParams.set(
                "user_id",
                user.githubId?.toString() ?? user.id,
            );
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
                    const escapeCSV = (
                        val: string | number | boolean | null,
                    ) => {
                        if (val === null || val === undefined) return "";
                        const str = String(val);
                        if (
                            str.includes(",") ||
                            str.includes('"') ||
                            str.includes("\n")
                        ) {
                            return `"${str.replace(/"/g, '""')}"`;
                        }
                        return str;
                    };
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
    );

export default accountRoutes;
