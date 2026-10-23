import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { StatusCode } from "hono/utils/http-status";
import type { Env } from "./env.ts";
import { readVendorJournals } from "./planning";

const READ_PIPES = new Set([
    "economics_bank_ledger_api",
    "economics_vendor_ledger_api",
    "economics_pollen_usage_api",
    "economics_revenue_share_api",
    "economics_stripe_sales_api",
    "economics_user_balances_api",
]);

export const economicsRoutes = new Hono<Env>()
    .get("/vendor-journals", async (c) => {
        c.header("Cache-Control", "private, no-store");
        return c.json(
            await readVendorJournals(c.env, c.req.query("refresh") === "1"),
        );
    })
    .get("/pipes/:pipe", async (c) => {
        const pipe = c.req.param("pipe");
        if (!READ_PIPES.has(pipe)) throw new HTTPException(404);
        const token = c.env.TINYBIRD_ECONOMICS_READ_TOKEN;
        if (!token)
            throw new HTTPException(503, {
                message: "Economics read token is not configured",
            });
        // Staging uses the materialized snapshot; production retains its live pipe.
        const upstreamPipe =
            pipe === "economics_pollen_usage_api"
                ? c.env.TINYBIRD_POLLEN_PIPE
                : pipe;
        if (
            pipe === "economics_pollen_usage_api" &&
            ![
                "economics_pollen_usage_api",
                "economics_pollen_usage_snapshot_api",
            ].includes(upstreamPipe)
        ) {
            throw new HTTPException(503, {
                message:
                    "TINYBIRD_POLLEN_PIPE must select the production or staging Pollen endpoint",
            });
        }
        const origin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
        const url = new URL(
            `${origin}/v0/pipes/${encodeURIComponent(upstreamPipe)}.json`,
        );
        if (c.env.TINYBIRD_DEPLOYMENT_ID)
            url.searchParams.set(
                "__tb__deployment",
                c.env.TINYBIRD_DEPLOYMENT_ID,
            );
        const upstream = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}` },
        });
        return c.newResponse(upstream.body, {
            status: (upstream.ok ? upstream.status : 502) as StatusCode,
            headers: {
                "Cache-Control": "private, no-store",
                "Content-Type":
                    upstream.headers.get("Content-Type") || "application/json",
            },
        });
    });
