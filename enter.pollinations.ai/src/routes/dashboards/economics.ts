import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { Env } from "../../env.ts";

const READ_PIPES = new Set([
    "economics_bank_ledger_api",
    "economics_compute_ledger_api",
    "economics_pollen_usage_api",
    "economics_private_config_api",
]);

export const economicsRoutes = new Hono<Env>().get(
    "/pipes/:pipe",
    async (c) => {
        const pipe = c.req.param("pipe");
        if (!READ_PIPES.has(pipe)) throw new HTTPException(404);
        const token = c.env.TINYBIRD_ECONOMICS_READ_TOKEN;
        if (!token)
            throw new HTTPException(503, {
                message: "Economics read token is not configured",
            });
        // Staging uses the materialized snapshot; production retains its live pipe.
        const upstreamPipe =
            pipe === "economics_pollen_usage_api" &&
            c.env.ENVIRONMENT !== "production"
                ? "economics_pollen_usage_snapshot_api"
                : pipe;
        const origin = new URL(c.env.TINYBIRD_INGEST_URL).origin;
        const upstream = await fetch(
            `${origin}/v0/pipes/${upstreamPipe}.json`,
            {
                headers: { Authorization: `Bearer ${token}` },
            },
        );
        return new Response(upstream.body, {
            status: upstream.ok ? upstream.status : 502,
            headers: {
                "Content-Type":
                    upstream.headers.get("Content-Type") || "application/json",
            },
        });
    },
);
