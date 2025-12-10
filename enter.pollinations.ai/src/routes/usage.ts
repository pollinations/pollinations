import { Hono } from "hono";
import { auth } from "../middleware/auth.ts";
import { validator } from "../middleware/validator.ts";
import { describeRoute } from "hono-openapi";
import { z } from "zod";
import type { Env } from "../env.ts";

// Query params schema
const usageQuerySchema = z.object({
    format: z.enum(["json", "csv"]).optional().default("json"),
    limit: z.coerce.number().min(1).max(1000).optional().default(100),
});

export const usageRoutes = new Hono<Env>()
    .use(auth({ allowApiKey: true, allowSessionCookie: true }))
    .get(
        "/",
        describeRoute({
            tags: ["Usage"],
            description: "Get your request history and spending data",
        }),
        validator("query", usageQuerySchema),
        async (c) => {
            const log = c.get("log");

            // Require authentication
            await c.var.auth.requireAuthorization({
                message: "Authentication required to view usage history",
            });

            const user = c.var.auth.requireUser();
            const { format, limit } = c.req.valid("query");

            log.debug(
                "[USAGE] Fetching usage for user: {userId}, format: {format}, limit: {limit}",
                {
                    userId: user.id,
                    format,
                    limit,
                },
            );

            // Build Tinybird API URL
            // The ingest URL is like: https://api.europe-west2.gcp.tinybird.co/v0/events?name=generation_event
            // We need to query the pipe instead: https://api.europe-west2.gcp.tinybird.co/v0/pipes/user_usage.json
            const tinybirdBaseUrl = c.env.TINYBIRD_INGEST_URL.replace(
                /\/v0\/events\?name=.*/,
                "/v0/pipes/user_usage.json",
            );

            const tinybirdUrl = new URL(tinybirdBaseUrl);
            tinybirdUrl.searchParams.set("user_id", user.id);
            tinybirdUrl.searchParams.set("limit", limit.toString());

            log.debug("[USAGE] Querying Tinybird: {url}", {
                url: tinybirdUrl.toString(),
            });

            try {
                const response = await fetch(tinybirdUrl.toString(), {
                    headers: {
                        Authorization: `Bearer ${c.env.TINYBIRD_ACCESS_TOKEN}`,
                    },
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    log.error("[USAGE] Tinybird error: {status} {error}", {
                        status: response.status,
                        error: errorText,
                    });
                    return c.json(
                        {
                            error: "Failed to fetch usage data",
                            details: errorText,
                        },
                        500,
                    );
                }

                const data = (await response.json()) as {
                    data: Array<{
                        startTime: string;
                        modelUsed: string | null;
                        eventType: string;
                        totalPrice: number;
                        tokenCountPromptText: number;
                        tokenCountCompletionText: number;
                        responseTime: number | null;
                    }>;
                };

                // Transform to cleaner format
                const usage = data.data.map((row) => ({
                    timestamp: row.startTime,
                    model: row.modelUsed,
                    eventType: row.eventType,
                    totalPrice: row.totalPrice,
                    promptTokens: row.tokenCountPromptText,
                    completionTokens: row.tokenCountCompletionText,
                    responseTime: row.responseTime,
                }));

                log.debug("[USAGE] Fetched {count} usage records", {
                    count: usage.length,
                });

                // Return CSV if requested
                if (format === "csv") {
                    const header =
                        "timestamp,model,eventType,totalPrice,promptTokens,completionTokens,responseTime";
                    const rows = usage.map(
                        (row) =>
                            `${row.timestamp},${row.model || ""},${row.eventType},${row.totalPrice},${row.promptTokens},${row.completionTokens},${row.responseTime || ""}`,
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
                log.error("[USAGE] Error fetching usage: {error}", { error });
                return c.json({ error: "Failed to fetch usage data" }, 500);
            }
        },
    );

export default usageRoutes;
