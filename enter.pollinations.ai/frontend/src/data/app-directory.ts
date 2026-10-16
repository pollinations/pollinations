/**
 * The community app directory, read from the same public Tinybird endpoint as
 * pollinations.ai (see `pollinations.ai/src/data/publicStats.ts`). The read
 * token below is the shared public one and is safe client-side.
 */
const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

/** One row of the community app directory synced from `app.json`. */
export type DirectoryApp = {
    name: string;
    web_url: string;
    screenshot_url: string | null;
    description: string;
    category: string;
    /** Comma-separated when an app ships on several ("web, mobile"). */
    platform: string;
    github_user_id: string;
    github_username: string;
    github_repository_url: string;
    github_repository_stars: string;
    /** "true" for BYOP apps; requests_24h only counts those. */
    byop: boolean | number | string;
    requests_24h: number | string | null;
    approved_date: string;
};

type TinybirdResponse<T> = { data: T[] };

export async function fetchAppDirectory(): Promise<DirectoryApp[]> {
    const response = await fetch(
        `${TINYBIRD}/app_directory_public.json?token=${PUBLIC_READ_TOKEN}&limit=1000`,
    );
    if (!response.ok) {
        throw new Error(`app_directory_public: ${response.status}`);
    }
    const body = (await response.json()) as TinybirdResponse<DirectoryApp>;
    return body.data ?? [];
}

/** The catalog's GitHub id column arrives as a string; ids may be empty. */
function sameOwner(rowGithubId: string, githubId: number): boolean {
    return rowGithubId?.trim() === String(githubId);
}

/** Match the directory's deduplication rule; app names alone are not unique. */
export const appIdentity = (
    app: Pick<DirectoryApp, "name" | "web_url" | "github_repository_url">,
) => `${app.name.toLowerCase()}|${app.web_url || app.github_repository_url}`;

/** The signed-in developer's listings, newest first. */
export function appsOwnedBy(
    rows: DirectoryApp[],
    githubId: number | null,
): DirectoryApp[] {
    if (githubId === null || githubId === undefined) return [];
    const seen = new Set<string>();
    const owned: DirectoryApp[] = [];
    for (const app of rows) {
        if (!sameOwner(app.github_user_id, githubId)) continue;
        const key = appIdentity(app);
        if (seen.has(key)) continue;
        seen.add(key);
        owned.push(app);
    }
    return owned.sort((a, b) =>
        (b.approved_date || "").localeCompare(a.approved_date || ""),
    );
}

/** BYOP apps carry measured traffic; others return null, like the website. */
export function byopRequests24h(app: DirectoryApp): number | null {
    if (
        !(app.byop === true || app.byop === 1 || app.byop === "true") ||
        app.requests_24h == null ||
        String(app.requests_24h).trim() === ""
    ) {
        return null;
    }
    const requests = Number(app.requests_24h);
    return Number.isFinite(requests) && requests >= 0 ? requests : null;
}
