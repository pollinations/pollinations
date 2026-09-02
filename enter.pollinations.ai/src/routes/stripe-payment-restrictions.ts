import { validator } from "@shared/middleware/validator.ts";
import { Hono } from "hono";
import { z } from "zod";
import type { Env } from "../env.ts";
import { createStripeClient } from "../utils/stripe.ts";
import {
    clearStripePaymentRestriction,
    expireOpenStripeCheckoutSessions,
    restrictStripePayments,
    type StripeCheckoutSessionCleanup,
} from "../utils/stripe-payment-restriction.ts";

const restrictionSchema = z
    .object({
        userId: z.string().trim().min(1),
        restricted: z.boolean(),
        reason: z.string().trim().min(1).max(200).optional(),
    })
    .superRefine((input, context) => {
        if (input.restricted && !input.reason) {
            context.addIssue({
                code: "custom",
                path: ["reason"],
                message: "reason is required when restricting payments",
            });
        }
    });

/** Payment-access operations. Authentication is enforced by the parent admin route. */
export const stripePaymentRestrictionAdminRoutes = new Hono<Env>().post(
    "/",
    validator("json", restrictionSchema),
    async (c) => {
        const input = c.req.valid("json");
        const user = await c.env.DB.prepare(
            `SELECT stripe_customer_id AS stripeCustomerId
            FROM user
            WHERE id = ?`,
        )
            .bind(input.userId)
            .first<{ stripeCustomerId: string | null }>();
        if (!user) {
            return c.json({ error: "User not found" }, 404);
        }

        let changed = false;
        let checkoutSessionCleanup: StripeCheckoutSessionCleanup = {
            listingComplete: true,
            expired: 0,
            failed: 0,
        };

        if (input.restricted) {
            changed = await restrictStripePayments(c.env.DB, input.userId, {
                reason: input.reason ?? "manual_review",
                source: "manual",
            });

            if (user.stripeCustomerId) {
                checkoutSessionCleanup = await expireOpenStripeCheckoutSessions(
                    createStripeClient(c.env),
                    user.stripeCustomerId,
                );
            }
        } else {
            changed = await clearStripePaymentRestriction(
                c.env.DB,
                input.userId,
            );
        }

        return c.json({
            userId: input.userId,
            restricted: input.restricted,
            changed,
            checkoutSessionCleanup,
        });
    },
);
