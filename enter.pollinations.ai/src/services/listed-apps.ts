/**
 * The dashboard's "My Apps" view: the community catalog listings owned by the
 * signed-in developer's GitHub account.
 *
 * Matching reuses the quest check's rule (services/quests/groups/app-growth.ts):
 * the catalog's github_user_id against String(user.githubId). The catalog is
 * operations/app-management/app.json, read through the public
 * app_directory_public Tinybird endpoint.
 */

/** One row of app_directory_public, as synced from app.json. */
export type ListedAppRow = {
    emoji: string;
    name: string;
    web_url: string;
    screenshot_url: string | null;
    description: string;
    language: string | null;
    category: string;
    platform: string;
    github_username: string;
    github_user_id: string;
    github_repository_url: string;
    github_repository_stars: string;
    discord_username: string | null;
    submitted_date: string | null;
    issue_url: string | null;
    approved_date: string | null;
    byop: boolean | number | string;
    requests_24h: number | string | null;
};

/** Match the catalog's deduplication rule; app names alone are not unique. */
const appIdentity = (app: ListedAppRow) =>
    `${app.name.toLowerCase()}|${app.web_url || app.github_repository_url}`;

/** The developer's listings, deduplicated and newest approval first. */
export function selectListedApps(
    rows: ListedAppRow[],
    githubUserId: string | null,
): ListedAppRow[] {
    if (githubUserId === null) return [];
    const seen = new Set<string>();
    return rows
        .filter((row) => {
            if (row.github_user_id !== githubUserId) return false;
            const identity = appIdentity(row);
            if (seen.has(identity)) return false;
            seen.add(identity);
            return true;
        })
        .sort(
            (a, b) =>
                (b.approved_date || "").localeCompare(a.approved_date || "") ||
                a.name.localeCompare(b.name),
        );
}
