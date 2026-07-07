import {
    APPS_SOURCE_URL,
    type CategoryFilterId,
    type PlatformFilterId,
    type SignalFilterId,
} from "../components/apps/copy.ts";

const CACHE_TTL_MS = 30 * 60 * 1000;
const FRESH_WINDOW_MS = 30 * 86400000;

export type App = {
    emoji: string;
    name: string;
    url: string;
    description: string;
    category: string;
    platforms: string[];
    github: string;
    githubId: string;
    repo: string;
    stars: number | null;
    approvedDate: string;
    byop: boolean;
    requests24h: number;
};

export type AppFilters = {
    categories: CategoryFilterId[];
    platforms: PlatformFilterId[];
    signals: SignalFilterId[];
};

type CacheEntry = {
    expiresAt: number;
    apps: App[];
};

let appsCache: CacheEntry | null = null;

export const appBadges = {
    fresh: (app: App) =>
        !!app.approvedDate &&
        new Date(app.approvedDate).getTime() >= Date.now() - FRESH_WINDOW_MS,
    pollen: (app: App) => app.byop,
    buzz: (app: App) => app.requests24h >= 100,
} satisfies Record<SignalFilterId, (app: App) => boolean>;

export function normalizeExternalUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "";
    if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
    return `https://${trimmed}`;
}

export function getGitHubUsername(value: string): string {
    return value.trim().replace(/^@/, "");
}

export function getGitHubProfileUrl(value: string): string {
    const username = getGitHubUsername(value);
    return username ? `https://github.com/${username}` : "";
}

export function getRepoName(value: string): string {
    try {
        const url = new URL(normalizeExternalUrl(value));
        if (url.hostname.replace(/^www\./, "") !== "github.com") return "";
        const [owner, repo] = url.pathname.split("/").filter(Boolean);
        return owner && repo ? `${owner}/${repo}` : "";
    } catch {
        return "";
    }
}

export function formatStars(stars: number | null): string {
    if (!stars) return "";
    if (stars >= 1000) return `${(stars / 1000).toFixed(1).replace(".0", "")}k`;
    return String(stars);
}

function parseStars(value: string): number | null {
    const match = value.match(/⭐\s*([\d.]+)\s*([kK])?/);
    if (!match) return null;
    const multiplier = match[2] ? 1000 : 1;
    return Math.round(Number.parseFloat(match[1]) * multiplier);
}

function splitList(value: string): string[] {
    return value
        .split(",")
        .map((item) => item.trim().toLowerCase())
        .filter(Boolean);
}

export function parseAppsMarkdown(markdown: string): App[] {
    const lines = markdown.split("\n");
    const headerIdx = lines.findIndex((line) => line.startsWith("| Emoji"));
    if (headerIdx === -1) return [];

    const headerCols = lines[headerIdx]
        .split("|")
        .map((col) => col.trim())
        .slice(1, -1);
    const columnIndex = (name: string) => headerCols.indexOf(name);

    const apps: App[] = [];
    for (const row of lines.slice(headerIdx + 2)) {
        if (!row.startsWith("|")) continue;

        const cols = row
            .split("|")
            .map((col) => col.trim())
            .slice(1, -1);
        const col = (name: string) => {
            const index = columnIndex(name);
            return index >= 0 ? (cols[index] ?? "") : "";
        };

        const name = col("Name");
        if (!name) continue;

        const repo = normalizeExternalUrl(col("Github_Repository_URL"));
        const webUrl = normalizeExternalUrl(col("Web_URL"));
        const url = webUrl || repo;

        apps.push({
            emoji: col("Emoji"),
            name,
            url,
            description: col("Description"),
            category: col("Category").toLowerCase(),
            platforms: splitList(col("Platform")),
            github: col("GitHub_Username"),
            githubId: col("GitHub_UserID"),
            repo,
            stars: parseStars(col("Github_Repository_Stars")),
            approvedDate: col("Approved_Date"),
            byop: col("BYOP") === "true",
            requests24h: Number.parseInt(col("Requests_24h"), 10) || 0,
        });
    }

    const seen = new Set<string>();
    return apps.filter((app) => {
        const key = app.name.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function loadApps(): Promise<App[]> {
    if (appsCache && appsCache.expiresAt > Date.now()) return appsCache.apps;

    const response = await fetch(APPS_SOURCE_URL);
    if (!response.ok) {
        throw new Error(`Failed to fetch apps: ${response.status}`);
    }

    const apps = parseAppsMarkdown(await response.text());
    appsCache = { apps, expiresAt: Date.now() + CACHE_TTL_MS };
    return apps;
}

export function sortApps(a: App, b: App): number {
    const buzz = Number(appBadges.buzz(b)) - Number(appBadges.buzz(a));
    if (buzz) return buzz;
    if (a.byop !== b.byop) return a.byop ? -1 : 1;
    const stars = (b.stars || 0) - (a.stars || 0);
    if (stars) return stars;
    return (b.approvedDate || "").localeCompare(a.approvedDate || "");
}

export function selectApps(
    apps: App[],
    { categories, platforms, signals }: AppFilters,
): App[] {
    return apps
        .filter((app) => {
            const categoryMatch =
                categories.length === 0 ||
                categories.some((category) => app.category === category);
            const platformMatch =
                platforms.length === 0 ||
                platforms.some((platform) => app.platforms.includes(platform));
            const signalMatch =
                signals.length === 0 ||
                signals.some((signal) => appBadges[signal](app));

            return categoryMatch && platformMatch && signalMatch;
        })
        .slice()
        .sort(sortApps);
}
