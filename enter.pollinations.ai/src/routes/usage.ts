import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

// Query params schema
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce.number().min(1).max(10000).optional().default(100),
    before: z.string().optional(), // ISO timestamp cursor for pagination
});

// Daily usage query params
const usageDailyQuerySchema = z.object({
    since: z.string().optional(), // ISO date (e.g., 2024-01-01)
    until: z.string().optional(), // ISO date
});

export const usageRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: "Get your request history and spending data",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage");

            // Require authentication
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
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

                    // Return 503 if Service Unavailable or similar network issues, else 500
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

                // Pass through directly - Tinybird returns clean format
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

// Daily aggregated usage endpoint
export const usageDailyRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Auth"],
            description: "Get daily aggregated usage data",
            hide: ({ c }) => c?.env.ENVIRONMENT !== "development",
        }),
        validator("query", usageDailyQuerySchema),
        async (c) => {
            const log = c.get("log").getChild("usage-daily");

            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();

            // In development, use pollen-router's user_id for testing
            const DEV_USER_ID = "ds1EIz1ELXSNZzzRKJ0jrCsGgLeiVfRh";
            const userId =
                c.env.ENVIRONMENT === "development" ? DEV_USER_ID : user.id;

            // Default to 90 days of data
            const now = new Date();
            const defaultSince = new Date(
                now.getTime() - 90 * 24 * 60 * 60 * 1000,
            );
            const sinceDate =
                defaultSince.toISOString().split("T")[0] + " 00:00:00"; // YYYY-MM-DD HH:MM:SS format

            log.debug("Fetching daily usage: userId={userId} since={since}", {
                userId,
                since: sinceDate,
            });

            const tinybirdOrigin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
            const tinybirdUrl = new URL(
                "/v0/pipes/user_usage_daily.json",
                tinybirdOrigin,
            );
            tinybirdUrl.searchParams.set("user_id", userId);
            tinybirdUrl.searchParams.set("since", sinceDate);

            try {
                const response = await fetch(tinybirdUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${c.env.TINYBIRD_READ_TOKEN}`,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    log.error("Tinybird error: {status} {error}", {
                        status: response.status,
                        error: errorText,
                    });
                    return c.json(
                        { error: "Failed to fetch usage data" },
                        response.status >= 500 ? 503 : 500,
                    );
                }

                const data = (await response.json()) as {
                    data: Array<{
                        date: string;
                        event_type: string;
                        model: string | null;
                        meter_source: string | null;
                        requests: number;
                        cost_usd: number;
                        input_tokens: number;
                        output_tokens: number;
                        api_key_names: string[];
                    }>;
                };

                log.debug("Fetched {count} daily records", {
                    count: data.data.length,
                });

                return c.json({
                    usage: data.data,
                    count: data.data.length,
                });
            } catch (error) {
                log.error("Error fetching daily usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    );

export default usageRoutes;
