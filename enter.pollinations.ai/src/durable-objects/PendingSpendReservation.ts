import { DurableObject } from "cloudflare:workers";
import { getLogger } from "@logtape/logtape";

type Reservation = {
    id: string;
    estimatedCost: number;
    timestamp: number;
    status: "pending" | "confirmed" | "released";
};

/**
 * PendingSpendReservation Durable Object
 *
 * The "Final Boss" of billing - prevents parallel request abuse by reserving
 * funds BEFORE processing starts. Think of it as a bouncer checking IDs at
 * the door, not after everyone's already inside ordering drinks.
 *
 * How it works:
 * - Reserves estimated cost atomically (no race conditions)
 * - Validates user has sufficient balance BEFORE creating reservation
 * - Tracks all active reservations per user
 * - Releases or confirms after request completes
 * - Auto-expires stale reservations (failsafe for crashed requests)
 *
 * Why it's groundbreaking:
 * - Makes billing 100% bulletproof against parallel abuse
 * - Users can't fire 100 requests when they only have balance for 1
 * - Atomic operations prevent any sneaky workarounds
 */
export class PendingSpendReservation extends DurableObject {
    private reservations: Map<string, Reservation> = new Map();
    private readonly log = getLogger(["durable", "pending-spend"]);
    private readonly RESERVATION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

    constructor(ctx: DurableObjectState, env: CloudflareBindings) {
        super(ctx, env);

        // Load state from storage - blockConcurrencyWhile prevents race conditions
        // during initialization. It's like putting up a "Closed for Inventory" sign
        // before opening the shop.
        ctx.blockConcurrencyWhile(async () => {
            const stored = await ctx.storage.get<[string, Reservation][]>(
                "reservations",
            );
            if (stored) {
                this.reservations = new Map(stored);
                this.log.debug("Loaded {count} reservations from storage", {
                    count: this.reservations.size,
                });
            }
        });
    }

    /**
     * Reserve funds for an upcoming request
     *
     * This is the critical atomic operation that prevents abuse. Validates
     * that the user has sufficient balance before creating the reservation.
     *
     * @param estimatedCost - Estimated pollen cost for the request
     * @param availableBalance - User's current available balance
     * @returns reservationId to track this reservation
     * @throws Error if insufficient balance
     */
    async reserveSpend(
        estimatedCost: number,
        availableBalance: number,
    ): Promise<string> {
        // Clean up expired reservations first
        await this.cleanupExpiredReservations();

        // Calculate current pending spend
        const currentPending = Array.from(this.reservations.values())
            .filter((r) => r.status === "pending")
            .reduce((sum, r) => sum + r.estimatedCost, 0);

        // THE FIX: Check if user has enough balance for this reservation
        // This is the atomic check that prevents parallel abuse
        if (currentPending + estimatedCost > availableBalance) {
            this.log.warn(
                "Reservation denied: insufficient balance (pending: {pending}, new: {new}, available: {available})",
                {
                    pending: currentPending,
                    new: estimatedCost,
                    available: availableBalance,
                },
            );
            throw new Error(
                `Insufficient balance. Available: ${availableBalance}, Pending: ${currentPending}, Requested: ${estimatedCost}`,
            );
        }

        const reservationId = crypto.randomUUID();
        const reservation: Reservation = {
            id: reservationId,
            estimatedCost,
            timestamp: Date.now(),
            status: "pending",
        };

        this.reservations.set(reservationId, reservation);
        await this.persist();

        this.log.debug(
            "Reserved {cost} pollen with ID {id} (pending: {pending}/{available}, total reservations: {total})",
            {
                cost: estimatedCost,
                id: reservationId,
                pending: currentPending + estimatedCost,
                available: availableBalance,
                total: this.reservations.size,
            },
        );

        return reservationId;
    }

    /**
     * Release a reservation without charging (e.g., request failed)
     */
    async releaseReservation(reservationId: string): Promise<void> {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
            this.log.warn(
                "Attempted to release non-existent reservation: {id}",
                { id: reservationId },
            );
            return;
        }

        this.reservations.delete(reservationId);
        await this.persist();

        this.log.debug("Released reservation {id} ({cost} pollen)", {
            id: reservationId,
            cost: reservation.estimatedCost,
        });
    }

    /**
     * Confirm actual spend and release reservation
     *
     * The reservation is removed regardless of actual cost - the actual billing
     * happens via the event system. This just ensures the "slot" is freed up.
     */
    async confirmSpend(
        reservationId: string,
        actualCost: number,
    ): Promise<void> {
        const reservation = this.reservations.get(reservationId);
        if (!reservation) {
            this.log.warn("Attempted to confirm non-existent reservation: {id}", {
                id: reservationId,
            });
            return;
        }

        reservation.status = "confirmed";
        this.reservations.delete(reservationId);
        await this.persist();

        this.log.debug(
            "Confirmed reservation {id} (estimated: {estimated}, actual: {actual})",
            {
                id: reservationId,
                estimated: reservation.estimatedCost,
                actual: actualCost,
            },
        );
    }

    /**
     * Get total pending spend across all active reservations
     */
    async getPendingSpend(): Promise<number> {
        await this.cleanupExpiredReservations();

        const total = Array.from(this.reservations.values())
            .filter((r) => r.status === "pending")
            .reduce((sum, r) => sum + r.estimatedCost, 0);

        this.log.debug("Total pending spend: {total} pollen", { total });
        return total;
    }

    /**
     * Get current state (for debugging)
     */
    async getState(): Promise<{
        totalReservations: number;
        totalPendingSpend: number;
        reservations: Reservation[];
    }> {
        await this.cleanupExpiredReservations();

        const reservations = Array.from(this.reservations.values());
        const totalPendingSpend = reservations
            .filter((r) => r.status === "pending")
            .reduce((sum, r) => sum + r.estimatedCost, 0);

        return {
            totalReservations: reservations.length,
            totalPendingSpend,
            reservations,
        };
    }

    /**
     * Reset all reservations (for testing)
     */
    async reset(): Promise<void> {
        this.reservations.clear();
        await this.persist();
        this.log.debug("Reset all reservations");
    }

    /**
     * Clean up reservations that have been pending too long
     *
     * Failsafe for requests that crashed or never completed. Nobody likes
     * zombie reservations hogging resources.
     */
    private async cleanupExpiredReservations(): Promise<void> {
        const now = Date.now();
        const expiredIds: string[] = [];

        for (const [id, reservation] of this.reservations.entries()) {
            if (
                reservation.status === "pending" &&
                now - reservation.timestamp > this.RESERVATION_TIMEOUT_MS
            ) {
                expiredIds.push(id);
            }
        }

        if (expiredIds.length > 0) {
            for (const id of expiredIds) {
                this.reservations.delete(id);
            }
            await this.persist();
            this.log.info("Cleaned up {count} expired reservations", {
                count: expiredIds.length,
            });
        }
    }

    /**
     * Persist reservations to durable storage
     */
    private async persist(): Promise<void> {
        await this.ctx.storage.put(
            "reservations",
            Array.from(this.reservations.entries()),
        );
    }
}
