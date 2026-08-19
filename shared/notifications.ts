// Trigger surface for the user-scoped notifications inbox. Any feature that
// wants to alert a user (a scheduled community-model price change, an
// account/security event, a platform announcement, ...) calls
// `notifyUser`/`notifyUsers` instead of writing to the `notification` table
// directly, so the shape of a notification stays consistent across features.
//
// Read paths (list / unread-count / mark-read) live in
// enter.pollinations.ai/src/routes/notifications.ts, next to the auth
// middleware they depend on.

import type { DrizzleD1Database } from "drizzle-orm/d1";
import type * as schema from "./db/better-auth.ts";
import { notification } from "./db/notifications.ts";

// Extend as new alert sources come online. Kept as a const array (not a DB
// enum) so adding a type is a one-line change, not a migration.
export const NOTIFICATION_TYPES = [
    "price_change",
    "system",
    "account",
    "billing",
    "security",
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const MAX_NOTIFICATION_TITLE_LENGTH = 200;
export const MAX_NOTIFICATION_BODY_LENGTH = 2000;

export interface NotifyUserInput {
    userId: string;
    type: NotificationType;
    title: string;
    body: string;
    /** Structured data the client can use to render richer UI, e.g.
     * `{ modelId, oldPrice, newPrice, effectiveAt }` for a price_change. */
    payload?: Record<string, unknown> | null;
    /** Optional call-to-action link (e.g. the model's pricing page). */
    link?: string | null;
    /** Set to insert with a specific id/timestamp (tests, backfills). */
    id?: string;
    createdAt?: Date;
}

type NotificationDb = DrizzleD1Database<typeof schema> | DrizzleD1Database;

function assertValidNotification(input: NotifyUserInput): void {
    if (!input.userId) {
        throw new Error("notifyUser: userId is required");
    }
    if (!NOTIFICATION_TYPES.includes(input.type)) {
        throw new Error(
            `notifyUser: unknown notification type "${input.type}"`,
        );
    }
    if (!input.title || input.title.length > MAX_NOTIFICATION_TITLE_LENGTH) {
        throw new Error(
            `notifyUser: title must be 1-${MAX_NOTIFICATION_TITLE_LENGTH} chars`,
        );
    }
    if (!input.body || input.body.length > MAX_NOTIFICATION_BODY_LENGTH) {
        throw new Error(
            `notifyUser: body must be 1-${MAX_NOTIFICATION_BODY_LENGTH} chars`,
        );
    }
}

/**
 * Pushes a single notification to a user's inbox. Fire-and-forget from the
 * caller's perspective: awaiting it only confirms the row was written, not
 * that the user has seen it.
 */
export async function notifyUser(
    db: NotificationDb,
    input: NotifyUserInput,
): Promise<{ id: string }> {
    assertValidNotification(input);

    const id = input.id ?? crypto.randomUUID();
    await db.insert(notification).values({
        id,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        payload: input.payload ?? null,
        link: input.link ?? null,
        createdAt: input.createdAt ?? new Date(),
    });

    return { id };
}

/**
 * Pushes the same (or per-user-customized) notification to many users in one
 * batch, e.g. everyone who used a community model whose price changes
 * tomorrow. Each insert stays a separate statement so the batch's bound
 * parameter count doesn't grow with row width, matching the pattern used for
 * reward inserts.
 */
export async function notifyUsers(
    db: NotificationDb,
    inputs: NotifyUserInput[],
): Promise<{ ids: string[] }> {
    if (inputs.length === 0) return { ids: [] };

    const rows = inputs.map((input) => {
        assertValidNotification(input);
        return {
            id: input.id ?? crypto.randomUUID(),
            userId: input.userId,
            type: input.type,
            title: input.title,
            body: input.body,
            payload: input.payload ?? null,
            link: input.link ?? null,
            createdAt: input.createdAt ?? new Date(),
        };
    });

    const statements = rows.map((row) => db.insert(notification).values(row));
    const [first, ...rest] = statements;
    if (!first) return { ids: [] };

    // D1 batches are transactional; this keeps a large fan-out (e.g. every
    // user of a soon-to-reprice model) to one round trip.
    await db.batch([first, ...rest]);

    return { ids: rows.map((row) => row.id) };
}
