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
    github: string;
    githubId: string;
    repo: string;
    discord: string;
    other: string;
    language: string;
    stars: number | null;
    date: string;
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

    const dataRows = lines
        .slice(headerIdx + 2)
        .filter((l) => l.startsWith("|"));

    for (const row of dataRows) {
        const cols = row.split("|").map((c) => c.trim());
        cols.shift();
        cols.pop();

        // Format: | Emoji | Name | Web_URL | Description | Language | Category | GitHub_Username | GitHub_UserID | Github_Repository_URL | Github_Repository_Stars | Discord_Username | Other | Submitted_Date | Issue_URL | Approved_Date |
        if (cols.length < 15) continue;

        const name = cols[1];
        let url = cols[2];
        const description = cols[3];
        const language = cols[4];
        const category = cols[5].toLowerCase();
        const github = cols[6];
        const githubId = cols[7];
        const repo = cols[8];
        const starsCol = cols[9];
        const discord = cols[10];
        const other = cols[11];
        const date = cols[12];

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
            github,
            githubId,
            repo,
            stars,
            discord,
            other,
            date,
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
