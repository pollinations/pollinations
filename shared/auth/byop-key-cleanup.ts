import { and, eq, inArray } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { apikey as apikeyTable } from "../db/better-auth.ts";

type AppKeyReference = {
    id: string;
    prefix?: string | null;
};

export async function deleteByopChildKeysForAppKey(
    db: DrizzleD1Database,
    appKey: AppKeyReference,
): Promise<void> {
    // Only publishable app keys can have BYOP children.
    if (appKey.prefix !== "pk") return;

    await db
        .delete(apikeyTable)
        .where(
            and(
                eq(apikeyTable.prefix, "sk"),
                eq(apikeyTable.byopClientKeyId, appKey.id),
            ),
        );
}

export async function deleteByopChildKeysForUserApps(
    db: DrizzleD1Database,
    userId: string,
): Promise<void> {
    const appKeys = await db
        .select({ id: apikeyTable.id })
        .from(apikeyTable)
        .where(
            and(eq(apikeyTable.userId, userId), eq(apikeyTable.prefix, "pk")),
        );

    if (appKeys.length === 0) return;

    await db.delete(apikeyTable).where(
        and(
            eq(apikeyTable.prefix, "sk"),
            inArray(
                apikeyTable.byopClientKeyId,
                appKeys.map((key) => key.id),
            ),
        ),
    );
}
