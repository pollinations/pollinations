const DIRECTORY_URL =
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/app_directory_public.json";
// The shared public read token the website uses for the same endpoint.
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

export type ListedApp = {
    emoji: string;
    name: string;
    web_url: string;
    description: string;
    category: string;
    platform: string;
    github_user_id: string;
    github_repository_url: string;
    github_repository_stars: string;
    approved_date: string;
    requests_24h: number | string | null;
};

/** The catalog rows listed by one GitHub account, newest first. */
export function appsOwnedBy(rows: ListedApp[], githubId: string): ListedApp[] {
    return rows
        .filter((row) => row.github_user_id === githubId)
        .sort((a, b) => b.approved_date.localeCompare(a.approved_date));
}

export async function fetchMyApps(githubId: string): Promise<ListedApp[]> {
    const response = await fetch(
        `${DIRECTORY_URL}?token=${PUBLIC_READ_TOKEN}&limit=5000`,
    );
    if (!response.ok) throw new Error(`Catalog: ${response.status}`);
    const { data } = (await response.json()) as { data?: ListedApp[] };
    return appsOwnedBy(data ?? [], githubId);
}
