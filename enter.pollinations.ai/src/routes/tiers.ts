import { Hono } from "hono";
import { authenticate } from "../middleware/authenticate.ts";
import { describeRoute } from "hono-openapi";
import type { Env } from "../env.ts";

type TierStatus = "none" | "seed" | "flower" | "nectar";

interface TierViewModel {
    status: TierStatus;
    next_refill_at_utc: string;
}

function getTierStatus(userTier: string | null | undefined): TierStatus {
    if (!userTier || userTier === "") return "none";
    const normalized = userTier.toLowerCase();
    if (normalized === "seed") return "seed";
    if (normalized === "flower") return "flower";
    if (normalized === "nectar") return "nectar";
    return "none";
}

function getNextMidnightUTC(): string {
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setUTCHours(24, 0, 0, 0);
    return tomorrow.toISOString();
}

export const tiersRoutes = new Hono<Env>()
    .use("*", authenticate)
    .get(
        "/view",
        describeRoute({
            description: "Get the current user's tier status and daily pollen information.",
            hide: false,
        }),
        async (c) => {
            const { user } = c.var.auth.requireActiveSession();
            
            const viewModel: TierViewModel = {
                status: getTierStatus(user.tier),
                next_refill_at_utc: getNextMidnightUTC(),
            };

            return c.json(viewModel);
        },
    );

export type TiersRoutes = typeof tiersRoutes;
