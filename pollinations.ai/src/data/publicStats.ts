/**
 * Anonymous, read-only platform data. Every endpoint here is documented in
 * gen.pollinations.ai/src/docs/public-stats.md and needs no account — the
 * Tinybird read token below is the shared public one and is safe client-side.
 *
 * Nothing on this site is hardcoded that these can measure.
 */
import { useAsync } from "./useAsync";

const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

/** One row of the community app directory — i.e. a row of apps/APPS.md. */
export type DirectoryApp = {
    emoji: string;
    name: string;
    web_url: string;
    description: string;
    language: string;
    category: string;
    platform: string;
    github_username: string;
    github_repository_url: string;
    github_repository_stars: string;
    submitted_date: string;
    approved_date: string;
    byop: boolean | number | string;
    requests_24h: number;
};

type TinybirdResponse<T> = { data: T[] };

async function tinybird<T>(pipe: string, params = ""): Promise<T[]> {
    const response = await fetch(
        `${TINYBIRD}/${pipe}.json?token=${PUBLIC_READ_TOKEN}${params}`,
    );
    if (!response.ok) throw new Error(`${pipe}: ${response.status}`);
    const body = (await response.json()) as TinybirdResponse<T>;
    return body.data ?? [];
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** An app lists several platforms, comma-separated. */
export const platformsOf = (app: DirectoryApp): string[] =>
    (app.platform ?? "")
        .split(",")
        .map((p) => p.trim().toLowerCase())
        .filter(Boolean);

/** "⭐1.2k" -> 1200. 0 when unrated. */
function starsOf(raw: string): number {
    const m = raw?.match(/([\d.]+)\s*([kK])?/);
    if (!m) return 0;
    return Number.parseFloat(m[1]) * (m[2] ? 1000 : 1);
}

/** "⭐1.2k" -> "1.2k" for display; "" when unrated. */
export function formatStars(raw: string): string {
    const m = raw?.match(/([\d.]+)\s*([kK])?/);
    if (!m) return "";
    return m[2] ? `${m[1]}k` : m[1];
}

export const githubProfileUrl = (username: string): string => {
    const handle = username?.trim().replace(/^@/, "");
    return handle ? `https://github.com/${handle}` : "";
};

/**
 * Same order as .github/scripts/app-update-greenhouse.js: busy first, then
 * BYOP, then stars, then newest. Without this the grid was in whatever order
 * the directory happened to return.
 */
export function sortApps(a: DirectoryApp, b: DirectoryApp): number {
    const buzz = Number(isBuzz(b)) - Number(isBuzz(a));
    if (buzz) return buzz;
    if (isPollen(a) !== isPollen(b)) return isPollen(a) ? -1 : 1;
    // starsOf, not the display string: parsing "1.2k" as a float gave 1.2, so
    // a 900-star repo outranked a 1.2k one.
    const stars =
        starsOf(b.github_repository_stars) - starsOf(a.github_repository_stars);
    if (stars) return stars;
    return (b.approved_date || "").localeCompare(a.approved_date || "");
}

/** Badge rules, matching .github/scripts/app-update-greenhouse.js exactly. */
export const isBuzz = (app: DirectoryApp) => Number(app.requests_24h) >= 100;
export const isPollen = (app: DirectoryApp) =>
    app.byop === true || app.byop === 1 || app.byop === "true";
export const isFresh = (app: DirectoryApp, now = Date.now()) => {
    if (!app.approved_date) return false;
    const approved = new Date(app.approved_date).getTime();
    return Number.isFinite(approved) && approved >= now - THIRTY_DAYS_MS;
};

/** The community app directory, deduplicated by name (newest first wins). */
export function useAppDirectory() {
    return useAsync<DirectoryApp[]>(async () => {
        const rows = await tinybird<DirectoryApp>(
            "app_directory_public",
            "&limit=1000",
        );
        const seen = new Set<string>();
        return rows.filter((app) => {
            const key = app.name?.toLowerCase();
            if (!key || seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    }, []);
}

type PlatformStats = {
    /** Requests in the most recent week. */
    requestsWeek: number;
    /** 2xx / (2xx + 5xx), cache excluded. */
    availability: number;
    /** Models callable right now, community models included. */
    models: number;
    /** Count per category, e.g. { text: 141, image: 51 }. */
    byCategory: Record<string, number>;
    /** Community models, which carry an owner/model name. */
    community: number;
};

type CatalogModel = { name?: string; category?: string };

function summariseCatalog(models: CatalogModel[]) {
    const byCategory: Record<string, number> = {};
    let community = 0;
    for (const model of models) {
        const category = model.category ?? "other";
        byCategory[category] = (byCategory[category] ?? 0) + 1;
        // BYOM models are published as owner/model.
        if (typeof model.name === "string" && model.name.includes("/")) {
            community += 1;
        }
    }
    return { byCategory, community };
}

type WeeklyHealthRow = {
    week: string;
    total_requests: number;
    availability: number;
};

/**
 * Monday of the current week, UTC — the bucket key `weekly_health_stats`
 * produces via toStartOfWeek(start_time, 1).
 */
function currentWeekStart(now = new Date()): string {
    const day = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    // getUTCDay is 0=Sunday; on a Monday-start week Sunday is six days in.
    day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
    return day.toISOString().slice(0, 10);
}

/**
 * Scale and reliability come from `weekly_health_stats` — 948 bytes for both,
 * versus 81 KB to sum `models/status`. Breadth still needs `/models`, which is
 * 113 KB; that's the one genuinely expensive number here, and it loads after
 * paint.
 *
 * The pipe buckets by calendar week, so the newest row is the week *in
 * progress*. Reading that made the hero collapse every Monday — measured at
 * 01:30 on Mon 27 Jul it said 1,608 requests and 100.0% availability, against
 * 7.3M and 99.48% for the week that had just ended. We report the last
 * complete week instead, which is also what "requests last week" claims.
 *
 * (Related trap already fixed: the param on models/status is `minutes`, not
 * `window`. An unknown param is ignored and silently returns the 60-minute
 * default — plausibly how "1.5M daily requests" survived, an hour of traffic
 * read as a day.)
 */
/**
 * Shared across callers. The hero and the dev kit both want these numbers, and
 * without this each mount fires its own 113 KB /models request — two in
 * flight at once, and the second came back empty, which showed up as a
 * catalogue of 0 models.
 */
let platformStats: Promise<PlatformStats | null> | null = null;

export function usePlatformStats() {
    return useAsync<PlatformStats | null>(() => {
        platformStats ??= loadPlatformStats();
        return platformStats;
    }, null);
}

function loadPlatformStats(): Promise<PlatformStats | null> {
    return (async () => {
        const [weeks, models] = await Promise.all([
            // 3, not 2: the window is relative to `now`, so the oldest bucket
            // is left-truncated. Three guarantees a whole one in the middle.
            tinybird<WeeklyHealthRow>("weekly_health_stats", "&weeks_back=3"),
            fetch("https://gen.pollinations.ai/models").then((r) =>
                r.ok ? r.json() : [],
            ),
        ]);

        // Rows come back oldest-first; drop the week still in progress.
        const thisWeek = currentWeekStart();
        const complete = weeks.filter((row) => row.week !== thisWeek);
        const latest = complete[complete.length - 1];

        const catalog: CatalogModel[] = Array.isArray(models) ? models : [];
        return {
            requestsWeek: latest?.total_requests ?? 0,
            availability: latest?.availability ?? 0,
            models: catalog.length,
            ...summariseCatalog(catalog),
        };
    })();
}

/**
 * 984868 → "985K", 1204000 → "1.2M".
 *
 * One decimal below 10K, because rounding is most visible there: 4888 became
 * "5K", which claims a milestone the number hasn't reached.
 */
export function compact(value: number): string {
    if (value >= 1_000_000)
        return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
    if (value >= 10_000) return `${Math.round(value / 1_000)}K`;
    if (value >= 1_000)
        return `${(value / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
    return String(value);
}
