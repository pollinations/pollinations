import { createMiddleware } from "hono/factory";
import type { AuthVariables } from "./auth.ts";
import { PendingSpendReservation } from "@/durable-objects/PendingSpendReservation.ts";
import type { LoggerVariables } from "@/middleware/logger.ts";
import type { ModelVariables } from "./model.ts";
import { getActivePriceDefinition } from "@shared/registry/registry.ts";
import { estimateMaxCost } from "@/utils/cost-estimation.ts";
import { Env } from "@/env.ts";

export type PendingSpendVariables = {
    pendingSpend?: {
        reservationId: string;
        estimatedCost: number;
        releaseReservation: () => Promise<void>;
        confirmSpend: (actualCost: number) => Promise<void>;
    };
};

export type PendingSpendEnv = {
    Bindings: CloudflareBindings;
    Variables: AuthVariables &
        LoggerVariables &
        ModelVariables &
        PendingSpendVariables;
};

/**
 * Pending Spend Reservation Middleware
 *
 * The nuclear option for preventing parallel request abuse. Reserves estimated
 * funds BEFORE request processing starts, making it impossible for users to
 * fire 100 requests when they only have balance for 1.
 *
 * This is like a nightclub bouncer with a clipboard - they count people going
 * in and out, not just hoping the fire marshal doesn't show up.
 */
export const pendingSpend = createMiddleware<PendingSpendEnv & Env>(
    async (c, next) => {
        const log = c.get("log").getChild("pending-spend");

        // Only apply to authenticated users with billing
        const user = c.var?.auth?.user;
        if (!user) {
            log.debug("Skipping pending spend, no authenticated user");
            return next();
        }

        const userId = user.id;
        log.debug("Applying pending spend reservation for user: {userId}", {
            userId,
        });

        // Get Durable Object for this user
        const id = c.env.PENDING_SPEND_RESERVATION.idFromName(userId);
        const stub = c.env.PENDING_SPEND_RESERVATION.get(
            id,
        ) as DurableObjectStub<PendingSpendReservation>;

        // Estimate maximum possible cost for this request
        const modelInfo = c.var.model;
        const priceDefinition = getActivePriceDefinition(modelInfo.resolved);
        if (!priceDefinition) {
            log.error(
                "Could not get price definition for model: {model}",
                { model: modelInfo.resolved },
            );
            return next();
        }

        // Conservative estimate: assume maximum tokens/units
        // Better to over-reserve than under-reserve
        const estimatedCost = estimateMaxCost(priceDefinition);

        log.debug(
            "Estimated max cost: {cost} pollen for model {model}",
            { cost: estimatedCost, model: modelInfo.resolved },
        );

        // Reserve the funds atomically
        const reservationId = await stub.reserveSpend(estimatedCost);

        log.info(
            "Reserved {cost} pollen (reservation: {id})",
            { cost: estimatedCost, id: reservationId },
        );

        // Provide helpers to release or confirm the reservation
        c.set("pendingSpend", {
            reservationId,
            estimatedCost,
            releaseReservation: async () => {
                await stub.releaseReservation(reservationId);
            },
            confirmSpend: async (actualCost: number) => {
                await stub.confirmSpend(reservationId, actualCost);
            },
        });

        await next();
    },
);
