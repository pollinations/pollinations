import { effectiveCommunityEndpointVisibility } from "@shared/community-endpoints.ts";
import * as schema from "@shared/db/better-auth.ts";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { Hono } from "hono";
import type { Env } from "../env.ts";

export const communityProviderIconRoutes = new Hono<Env>().get(
    "/*",
    async (c) => {
        const match = /\/([A-Za-z0-9_-]+)\.svg$/u.exec(c.req.path);
        const userId = match?.[1];
        if (!userId) return c.body(null, 404);
        const db = drizzle(c.env.DB, { schema });
        const owner = await db.query.user.findFirst({
            columns: { communityProviderIconSvg: true },
            where: eq(schema.user.id, userId),
        });
        if (!owner?.communityProviderIconSvg) return c.body(null, 404);

        const publicListings = await db
            .select({
                visibility: schema.communityEndpoint.visibility,
                pendingVisibility: schema.communityEndpoint.pendingVisibility,
                pendingAt: schema.communityEndpoint.pendingAt,
            })
            .from(schema.communityEndpoint)
            .where(
                and(
                    eq(schema.communityEndpoint.ownerUserId, userId),
                    isNull(schema.communityEndpoint.hiddenAt),
                ),
            );
        if (
            !publicListings.some(
                (listing) =>
                    effectiveCommunityEndpointVisibility(
                        listing.visibility,
                        listing.pendingVisibility,
                        listing.pendingAt,
                    ) === "public",
            )
        ) {
            return c.body(null, 404);
        }
        c.header("Content-Type", "image/svg+xml; charset=utf-8");
        c.header("X-Content-Type-Options", "nosniff");
        c.header("Content-Security-Policy", "default-src 'none'");
        c.header("Cross-Origin-Resource-Policy", "cross-origin");
        c.header("Access-Control-Allow-Origin", "*");
        c.header("Referrer-Policy", "no-referrer");
        c.header("Content-Disposition", "inline");
        c.header("Cache-Control", "public, max-age=300, must-revalidate");
        return c.body(owner.communityProviderIconSvg);
    },
);
