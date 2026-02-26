import { useEffect, useState } from "react";

/**
 * Hook to fetch and parse APPS.md file
 * Returns array of apps parsed from markdown table
 */
export interface App {
    emoji: string;
    name: string;
    url: string;
    description: string;
    category: string;
    platform: string;
    github: string;
    githubId: string;
    repo: string;
    discord: string;
    other: string;
    language: string;
    stars: number | null;
    date: string;
    approvedDate: string;
    byop: boolean;
    requests24h: number;
}

interface UseAppsReturn {
    apps: App[];
    loading: boolean;
    error: Error | null;
}

/**
 * Parse apps from markdown table
 */
function parseAppsMarkdown(markdown: string): App[] {
    const lines = markdown.split("\n");
    const apps: App[] = [];

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) return apps;

    // Parse header to get column positions — works with both old and new APPS.md formats
    const headerCols = lines[headerIdx].split("|").map((c) => c.trim());
    headerCols.shift();
    headerCols.pop();
    const ci = (name: string) => headerCols.indexOf(name);

    const dataRows = lines
        .slice(headerIdx + 2)
        .filter((l) => l.startsWith("|"));

    for (const row of dataRows) {
        const cols = row.split("|").map((c) => c.trim());
        cols.shift();
        cols.pop();

        if (cols.length < 15) continue;

        const name = cols[ci("Name")];
        let url = cols[ci("Web_URL")];
        const description = cols[ci("Description")];
        const language = cols[ci("Language")];
        const category = (cols[ci("Category")] || "").toLowerCase();
        const platform = cols[ci("Platform")] || "";
        const github = cols[ci("GitHub_Username")];
        const githubId = cols[ci("GitHub_UserID")];
        const repo = cols[ci("Github_Repository_URL")];
        const starsCol = cols[ci("Github_Repository_Stars")];
        const discord = cols[ci("Discord_Username")];
        const other = cols[ci("Other")];
        const date = cols[ci("Submitted_Date")];
        const approvedDate = cols[ci("Approved_Date")] || "";
        const byopIdx = ci("BYOP");
        const byop = byopIdx >= 0 && cols.length > byopIdx ? cols[byopIdx] === "true" : false;
        const req24hIdx = ci("Requests_24h");
        const requests24h = req24hIdx >= 0 && cols.length > req24hIdx ? parseInt(cols[req24hIdx], 10) || 0 : 0;

        // If no web URL but there's a repo, use repo as URL (fallback for repo-only apps)
        if (!url && repo) {
            url = repo;
        }

        let stars: number | null = null;
        const starsMatch = starsCol.match(/⭐([\d.]+)(k)?/);
        if (starsMatch) {
            stars = parseFloat(starsMatch[1]);
            if (starsMatch[2] === "k") stars *= 1000;
            stars = Math.round(stars);
        }

        apps.push({
            emoji: cols[0],
            name,
            url,
            description,
            language,
            category,
            platform,
            github,
            githubId,
            repo,
            stars,
            discord,
            other,
            date,
            approvedDate,
            byop,
            requests24h,
        });
    }

    return apps;
}

/**
 * Hook to fetch and parse APPS.md file
 * Returns array of apps parsed from markdown table
 */
export function useApps(filePath: string): UseAppsReturn {
    const [apps, setApps] = useState<App[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        if (!filePath) {
            setLoading(false);
            return;
        }

        async function fetchApps() {
            try {
                const response = await fetch(filePath);
                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch apps: ${response.statusText}`,
                    );
                }

                const text = await response.text();
                const parsedApps = parseAppsMarkdown(text);

                setApps(parsedApps);
                setLoading(false);
            } catch (err) {
                console.error("Error loading apps:", err);
                setError(err instanceof Error ? err : new Error(String(err)));
                setLoading(false);
            }
        }

        fetchApps();
    }, [filePath]);

    return { apps, loading, error };
}
