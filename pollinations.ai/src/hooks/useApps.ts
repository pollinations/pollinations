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
 * Known platform values used to detect shifted columns in rows
 * where a Platform column exists but the header doesn't declare it.
 */
const KNOWN_PLATFORMS = new Set([
    "web",
    "android",
    "ios",
    "windows",
    "macos",
    "desktop",
    "cli",
    "discord",
    "telegram",
    "whatsapp",
    "library",
    "browser-ext",
    "roblox",
    "wordpress",
    "api",
]);

/**
 * Parse a single table section (header + separator + data rows).
 * Returns parsed apps for that section.
 */
function parseTableSection(headerLine: string, dataRows: string[]): App[] {
    const apps: App[] = [];

    const headerCols = headerLine.split("|").map((c) => c.trim());
    headerCols.shift();
    headerCols.pop();
    const ci = (name: string) => headerCols.indexOf(name);

    const hasPlatformCol = ci("Platform") >= 0;
    const githubColIdx = ci("GitHub_Username");

    for (const row of dataRows) {
        const cols = row.split("|").map((c) => c.trim());
        cols.shift();
        cols.pop();

        if (cols.length < 15) continue;

        // Detect rows with an extra Platform column when the header doesn't have one.
        // If the value at the GitHub_Username position is a known platform value
        // (not starting with @), the row has an extra column shifted in.
        let platform = "";
        let offset = 0;
        if (
            !hasPlatformCol &&
            githubColIdx >= 0 &&
            KNOWN_PLATFORMS.has(cols[githubColIdx]?.toLowerCase())
        ) {
            platform = cols[githubColIdx].toLowerCase();
            offset = 1;
        } else if (hasPlatformCol) {
            platform = (cols[ci("Platform")] || "").toLowerCase();
        }

        const col = (name: string) => {
            const idx = ci(name);
            if (idx < 0) return "";
            // Apply offset for columns after the injected Platform column
            return cols[idx + (idx >= githubColIdx ? offset : 0)] || "";
        };

        const name = col("Name");
        let url = col("Web_URL");
        const description = col("Description");
        const language = col("Language");
        const category = col("Category").toLowerCase();
        const github = col("GitHub_Username");
        const githubId = col("GitHub_UserID");
        const repo = col("Github_Repository_URL");
        const starsCol = col("Github_Repository_Stars");
        const discord = col("Discord_Username");
        const other = col("Other");
        const date = col("Submitted_Date");
        const approvedDate = col("Approved_Date");
        const byop = col("BYOP") === "true";
        const requests24h = parseInt(col("Requests_24h"), 10) || 0;

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
 * Parse apps from markdown table.
 * Handles multiple table sections (different headers) and deduplicates by name.
 */
function parseAppsMarkdown(markdown: string): App[] {
    const lines = markdown.split("\n");

    // Find all header rows — APPS.md may contain multiple table sections
    const headerIndices: number[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].startsWith("| Emoji")) {
            headerIndices.push(i);
        }
    }
    if (headerIndices.length === 0) return [];

    const allApps: App[] = [];

    for (let h = 0; h < headerIndices.length; h++) {
        const headerIdx = headerIndices[h];
        const nextHeaderIdx = headerIndices[h + 1] ?? lines.length;
        const dataRows = lines
            .slice(headerIdx + 2, nextHeaderIdx)
            .filter((l) => l.startsWith("|") && !l.startsWith("| ---"));

        allApps.push(...parseTableSection(lines[headerIdx], dataRows));
    }

    // Deduplicate by name — keep first occurrence (newest, since APPS.md is newest-first)
    const seen = new Set<string>();
    return allApps.filter((app) => {
        const key = app.name.toLowerCase().trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
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
