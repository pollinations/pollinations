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
        if (cols.length < 11) continue;

        const nameMatch = cols[1].match(/\[([^\]]+)\]\(([^)]+)\)/);
        const name = nameMatch ? nameMatch[1] : cols[1];
        const url = nameMatch ? nameMatch[2] : "";

        let stars: number | null = null;
        const starsMatch = cols[7].match(/⭐([\d.]+)(k)?/);
        if (starsMatch) {
            stars = parseFloat(starsMatch[1]);
            if (starsMatch[2] === "k") stars *= 1000;
            stars = Math.round(stars);
        }

        apps.push({
            emoji: cols[0],
            name,
            url,
            description: cols[2],
            language: cols[3],
            category: cols[4].toLowerCase(),
            github: cols[5],
            repo: cols[6],
            stars,
            discord: cols[8],
            other: cols[9],
            date: cols[10],
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
