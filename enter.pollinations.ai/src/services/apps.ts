import { APP_CATEGORIES, APP_PLATFORMS } from "@shared/app-catalog.ts";
import { app } from "@shared/db/apps.ts";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

/** One app as its owner sees it. */
export const listedAppSchema = z.object({
    id: z.string(),
    name: z.string(),
    emoji: z.string().nullable(),
    description: z.string(),
    webUrl: z.string(),
    screenshotUrl: z.string().nullable(),
    category: z.string().nullable(),
    platforms: z.array(z.string()),
    repositoryUrl: z.string().nullable(),
    issueUrl: z.string().nullable(),
    approvedDate: z.string().nullable(),
    /** In the public catalog: approved, and not taken out by its owner. */
    listed: z.boolean(),
});

export type ListedApp = z.infer<typeof listedAppSchema>;

const url = z.url({ protocol: /^https?$/ }).max(500);

/** The fields an owner edits; the catalog's submission rules apply. */
export const updateAppSchema = z
    .object({
        name: z.string().trim().min(1).max(80),
        description: z.string().trim().min(20).max(200),
        url: url.nullable(),
        repositoryUrl: url.nullable(),
        category: z.enum(APP_CATEGORIES),
        platform: z.enum(APP_PLATFORMS),
        listed: z.boolean(),
    })
    .partial();

export type AppUpdate = z.infer<typeof updateAppSchema>;

/** The apps a GitHub account owns and has not deleted. */
const owned = (githubId: number) =>
    and(eq(app.githubUserId, githubId), eq(app.deleted, false));

const toListedApp = (row: typeof app.$inferSelect): ListedApp => ({
    id: row.id,
    name: row.name,
    emoji: row.emoji,
    description: row.description,
    webUrl: row.url ?? "",
    screenshotUrl: row.screenshotUrl,
    category: row.category,
    platforms: row.platform
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean),
    repositoryUrl: row.repositoryUrl,
    issueUrl: row.issueUrl,
    approvedDate: row.approvedDate,
    listed: row.approvedDate !== null && !row.unlisted,
});

/** The apps of one GitHub account, newest approval first. */
export async function listApps(
    d1: D1Database,
    githubId: number | null,
): Promise<ListedApp[]> {
    if (githubId === null) return [];
    const rows = await drizzle(d1)
        .select()
        .from(app)
        .where(owned(githubId))
        .orderBy(desc(app.approvedDate), app.name);
    return rows.map(toListedApp);
}

/** Saves an owner's edit; null when the app is not theirs. */
export async function updateApp(
    d1: D1Database,
    githubId: number | null,
    id: string,
    changes: AppUpdate,
): Promise<ListedApp | null> {
    if (githubId === null) return null;
    const { listed, ...fields } = changes;
    const [row] = await drizzle(d1)
        .update(app)
        .set({ ...fields, ...(listed !== undefined && { unlisted: !listed }) })
        .where(and(eq(app.id, id), owned(githubId)))
        .returning();
    return row ? toListedApp(row) : null;
}

/**
 * Deletes an owner's app; false when the app is not theirs. The row is kept and
 * marked, because the catalog import adds any app it does not find.
 */
export async function deleteApp(
    d1: D1Database,
    githubId: number | null,
    id: string,
): Promise<boolean> {
    if (githubId === null) return false;
    const rows = await drizzle(d1)
        .update(app)
        .set({ deleted: true })
        .where(and(eq(app.id, id), owned(githubId)))
        .returning({ id: app.id });
    return rows.length > 0;
}
