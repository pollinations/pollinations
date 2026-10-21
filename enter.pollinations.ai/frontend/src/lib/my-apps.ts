const DIRECTORY_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/app_directory_public.json";
// Shared public read token used by pollinations.ai for the community app catalog.
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

export type ListedApp = {
    emoji: string;
    name: string;
    web_url: string;
    screenshot_url: string;
    description: string;
    category: string;
    platform: string;
    github_user_id: string;
    github_repository_url: string;
    github_repository_stars: string;
    issue_url: string;
    approved_date: string;
    byop: boolean | number | string;
    requests_24h: number | string | null;
};

export const appIdentity = (
    app: Pick<ListedApp, "name" | "web_url" | "github_repository_url">,
) => `${app.name.toLowerCase()}|${app.web_url || app.github_repository_url}`;

export const isByop = (app: ListedApp) =>
    app.byop === true || app.byop === 1 || app.byop === "true";

/** Catalog rows belonging to one GitHub account, deduplicated and newest first. */
export function appsOwnedBy(
    rows: ListedApp[],
    githubId: string | null | undefined,
): ListedApp[] {
    if (!githubId) return [];
    const target = String(githubId);
    const seen = new Set<string>();
    return rows
        .filter((row) => {
            if (!row.name || String(row.github_user_id) !== target) {
                return false;
            }
            const key = appIdentity(row);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        })
        .sort(
            (a, b) =>
                (b.approved_date || "").localeCompare(a.approved_date || "") ||
                a.name.localeCompare(b.name),
        );
}

export async function fetchMyApps(
    githubId: string | null,
): Promise<ListedApp[]> {
    if (!githubId) return [];
    const response = await fetch(
        `${DIRECTORY_URL}?token=${PUBLIC_READ_TOKEN}&limit=5000`,
    );
    if (!response.ok) throw new Error(`Catalog: ${response.status}`);
    const { data } = (await response.json()) as { data?: ListedApp[] };
    return appsOwnedBy(data ?? [], githubId);
}
