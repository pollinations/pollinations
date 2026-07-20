import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "drizzle-orm/d1";
import { organization as organizationTable } from "../db/better-auth.ts";

export type OrganizationBalance = {
    packBalance: number;
};

export async function getOrganizationBalance(
    db: DrizzleD1Database,
    organizationId: string,
): Promise<OrganizationBalance> {
    const rows = await db
        .select({ packBalance: organizationTable.packBalance })
        .from(organizationTable)
        .where(eq(organizationTable.id, organizationId))
        .limit(1);

    return { packBalance: rows[0]?.packBalance ?? 0 };
}
