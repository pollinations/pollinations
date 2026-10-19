import { z } from "zod";
import { fetchTinybirdRows, requireTinybirdReadToken } from "./tinybird.ts";

/**
 * The community app directory (operations/app-management/app.json), synced to
 * Tinybird daily. Values arrive as strings: the sync writes every column as
 * text, so booleans and numbers are coerced below.
 */
export type AppDirectoryRow = {
    emoji?: string | null;
    name?: string | null;
    web_url?: string | null;
    screenshot_url?: string | null;
    description?: string | null;
    category?: string | null;
    platform?: string | null;
    github_user_id?: string | number | null;
    github_repository_url?: string | null;
    issue_url?: string | null;
    approved_date?: string | null;
    byop?: boolean | number | string | null;
    requests_24h?: number | string | null;
};

/** One listing as the dashboard shows it. */
export const listedAppSchema = z.object({
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
    byop: z.boolean(),
    requests24h: z.number().nullable(),
});

export type ListedApp = z.infer<typeof listedAppSchema>;

const asText = (value: string | null | undefined): string | null => {
    const text = value?.trim();
    return text ? text : null;
};

/**
 * Tinybird stores booleans as 0/1 and the sync may carry them as text, so all
 * four truthy spellings count.
 */
const asBoolean = (value: AppDirectoryRow["byop"]): boolean =>
    value === true || value === 1 || value === "1" || value === "true";

/** "web, android" → ["web", "android"], matching what the website lists. */
const platformsOf = (platform: string | null | undefined): string[] =>
    (platform ?? "")
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean);

const asCount = (value: number | string | null | undefined): number | null => {
    if (value === null || value === undefined) return null;
    if (String(value).trim() === "") return null;
    const count = Number(value);
    return Number.isFinite(count) && count >= 0 ? count : null;
};

/** Newest approval first; unapproved rows last; ties by name. */
const newestFirst = (a: ListedApp, b: ListedApp): number => {
    const byDate = (b.approvedDate ?? "").localeCompare(a.approvedDate ?? "");
    return byDate !== 0 ? byDate : a.name.localeCompare(b.name);
};

/**
 * The catalog rows owned by one GitHub account, deduplicated the way the
 * website's directory does (name plus URL) and ordered newest approval first.
 * A signed-in account without a linked GitHub id owns nothing.
 */
export function listedAppsFor(
    rows: readonly AppDirectoryRow[],
    githubId: number | string | null | undefined,
): ListedApp[] {
    if (githubId === null || githubId === undefined || githubId === "") {
        return [];
    }
    const owner = String(githubId).trim();
    const seen = new Set<string>();
    const apps: ListedApp[] = [];

    for (const row of rows) {
        const name = asText(row.name);
        const githubUserId = asText(
            row.github_user_id === null || row.github_user_id === undefined
                ? null
                : String(row.github_user_id),
        );
        if (!name || !githubUserId || githubUserId !== owner) continue;

        const webUrl = asText(row.web_url) ?? "";
        const identity = `${name.toLowerCase()}|${webUrl}`;
        if (seen.has(identity)) continue;
        seen.add(identity);

        const byop = asBoolean(row.byop);
        // Non-BYOP counts belong to the developer's whole account, not to the
        // listing, so only a Pollen Pay app reports traffic.
        const requests24h = byop ? asCount(row.requests_24h) : null;

        apps.push({
            name,
            emoji: asText(row.emoji),
            description: asText(row.description) ?? "",
            webUrl,
            screenshotUrl: asText(row.screenshot_url),
            category: asText(row.category),
            platforms: platformsOf(row.platform),
            repositoryUrl: asText(row.github_repository_url),
            issueUrl: asText(row.issue_url),
            approvedDate: asText(row.approved_date),
            byop,
            requests24h,
        });
    }

    return apps.sort(newestFirst);
}

/** The public directory is small, so one wide read covers every owner. */
const DIRECTORY_LIMIT = 5000;

/** The caller's listings, read from the public directory copy in Tinybird. */
export async function listListedApps(
    env: CloudflareBindings,
    githubId: number | null,
): Promise<ListedApp[]> {
    if (githubId === null) return [];

    const rows = await fetchTinybirdRows<AppDirectoryRow>(
        new URL(env.TINYBIRD_INGEST_URL).origin,
        "/v0/pipes/app_directory_public.json",
        requireTinybirdReadToken(env),
        { limit: String(DIRECTORY_LIMIT) },
    );

    return listedAppsFor(rows, githubId);
}
