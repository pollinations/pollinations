import { app } from "@shared/db/apps.ts";
import { getTableColumns } from "drizzle-orm";
import { drizzle } from "drizzle-orm/d1";
import { z } from "zod";

// Approved submissions land in this file; the database is the record after
// that, so an app is copied once and never overwritten.
const CATALOG_URL =
    "https://raw.githubusercontent.com/pollinations/pollinations/main/operations/app-management/app.json";

const text = z.string().trim().min(1);

const catalogSchema = z.array(
    z
        .object({
            id: text,
            name: text,
            emoji: text,
            description: text,
            category: text,
            platform: text,
            language: text.nullable(),
            url: text.nullable(),
            repositoryUrl: text.nullable(),
            screenshotUrl: text.nullish(),
            githubUserId: z
                .string()
                .regex(/^\d+$/)
                .transform(Number)
                .nullable(),
            githubUsername: text.nullable(),
            discordUsername: text.nullable(),
            submittedDate: text.nullable(),
            issueUrl: text.nullable(),
            approvedDate: text.nullable(),
        })
        // Everything in the catalog is listed, so an old entry without an
        // approval date takes its submission date.
        .transform((entry) => ({
            ...entry,
            approvedDate: entry.approvedDate ?? entry.submittedDate,
        })),
);

// D1 binds at most 100 values per statement, one per column of each app.
const APPS_PER_STATEMENT = Math.floor(
    100 / Object.keys(getTableColumns(app)).length,
);

/** Adds the catalog apps the database lacks; returns how many. */
export async function importApps(
    d1: D1Database,
    catalog: unknown,
): Promise<number> {
    const db = drizzle(d1);
    const known = new Set(
        (await db.select({ id: app.id }).from(app)).map((row) => row.id),
    );
    const added = catalogSchema
        .parse(catalog)
        .filter((entry) => !known.has(entry.id));

    const statements = [];
    for (let i = 0; i < added.length; i += APPS_PER_STATEMENT) {
        statements.push(
            db
                .insert(app)
                .values(added.slice(i, i + APPS_PER_STATEMENT))
                .onConflictDoNothing(),
        );
    }
    const [first, ...rest] = statements;
    if (first) await db.batch([first, ...rest]);
    return added.length;
}

export async function importCatalogApps(env: CloudflareBindings) {
    const response = await fetch(CATALOG_URL);
    if (!response.ok) {
        throw new Error(`App catalog fetch failed: ${response.status}`);
    }
    return importApps(env.DB, await response.json());
}
