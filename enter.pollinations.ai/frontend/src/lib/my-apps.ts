export type ListedApp = {
    name: string;
    description: string | null;
    url: string | null;
    image: string | null;
    approved_date: string | null;
    github_user_id: string;
};

/**
 * Filter listed apps by GitHub user ID, sorted by approved_date descending.
 * Apps with null approved_date sort last.
 */
export function appsOwnedBy(rows: ListedApp[], githubId: string): ListedApp[] {
    return rows
        .filter((row) => row.github_user_id === githubId)
        .sort((a, b) => {
            const dateA = a.approved_date
                ? Date.parse(a.approved_date)
                : Number.NEGATIVE_INFINITY;
            const dateB = b.approved_date
                ? Date.parse(b.approved_date)
                : Number.NEGATIVE_INFINITY;
            return dateB - dateA;
        });
}
