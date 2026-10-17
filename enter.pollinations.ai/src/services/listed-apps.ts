/**
 * The public app catalog (`app_directory_public`) as the dashboard needs it:
 * the rows listed by one GitHub account.
 *
 * Tinybird stores every column as a string and uses "" for an absent value.
 */
export type AppDirectoryRow = {
    emoji: string;
    name: string;
    description: string;
    category: string;
    platform: string;
    web_url: string;
    screenshot_url: string;
    github_user_id: string;
    github_repository_url: string;
    issue_url: string;
    approved_date: string;
    byop: string;
    requests_24h: string;
};

export type ListedApp = {
    name: string;
    emoji: string;
    description: string;
    category: string;
    platform: string;
    webUrl: string | null;
    repositoryUrl: string | null;
    screenshotUrl: string | null;
    byop: boolean;
    /** Only meaningful for BYOP apps; elsewhere the count is the developer's. */
    requests24h: number | null;
    approvedDate: string | null;
    issueUrl: string | null;
};

/** The account's listings, newest approval first. */
export function formatListedApps(
    rows: AppDirectoryRow[],
    githubUserId: string,
): ListedApp[] {
    return rows
        .filter((row) => row.github_user_id === githubUserId)
        .sort((left, right) =>
            (right.approved_date || "").localeCompare(left.approved_date || ""),
        )
        .map((row) => {
            const requests24h = Number(row.requests_24h);
            return {
                name: row.name,
                emoji: row.emoji,
                description: row.description,
                category: row.category,
                platform: row.platform,
                webUrl: row.web_url || null,
                repositoryUrl: row.github_repository_url || null,
                screenshotUrl: row.screenshot_url || null,
                byop: row.byop === "true",
                requests24h:
                    row.requests_24h && Number.isFinite(requests24h)
                        ? requests24h
                        : null,
                approvedDate: row.approved_date || null,
                issueUrl: row.issue_url || null,
            };
        });
}
