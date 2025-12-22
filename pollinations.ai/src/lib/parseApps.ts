/**
 * Parse apps from apps/APPS.md markdown table (symlinked)
 */

// Import raw markdown content (copied from apps/APPS.md at build time)
import appsMarkdown from "./APPS.md?raw";

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

// Category mapping for display (must match lowercase categories in APPS.md)
export const CATEGORIES = [
    { id: "creative", label: "Creative" },
    { id: "chat", label: "Chat" },
    { id: "games", label: "Games" },
    { id: "hackandbuild", label: "Dev Tools" },
    { id: "vibecoding", label: "Vibes" },
    { id: "socialbots", label: "Social Bots" },
    { id: "learn", label: "Learn" },
    { id: "featured", label: "Featured" },
];

function parseAppsMarkdown(markdown: string): App[] {
    const lines = markdown.split("\n");
    const apps: App[] = [];

    const headerIdx = lines.findIndex((l) => l.startsWith("| Emoji"));
    if (headerIdx === -1) return apps;

    const dataRows = lines
        .slice(headerIdx + 2)
        .filter((l) => l.startsWith("|"));

    for (const row of dataRows) {
        // Don't filter(Boolean) - we need empty columns too
        const cols = row.split("|").map((c) => c.trim());
        // Remove first and last empty strings from split
        cols.shift(); // remove empty before first |
        cols.pop(); // remove empty after last |
        // Format: Emoji | Name | Description | Language | Category | GitHub | Repo | Stars | Discord | Other | Submitted
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

// Parse at build time (fast, bundled)
export const allApps = parseAppsMarkdown(appsMarkdown);
