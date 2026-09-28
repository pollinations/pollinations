/**
 * Anonymous, read-only platform data. Every endpoint here is documented in
 * gen.pollinations.ai/src/docs/public-stats.md and needs no account — the
 * Tinybird read token below is the shared public one and is safe client-side.
 *
 * Nothing on this site is hardcoded that these can measure.
 */
import { cachePublic } from "./cachePublic";
import { useAsync } from "./useAsync";

const TINYBIRD = "https://api.europe-west2.gcp.tinybird.co/v0/pipes";
const PUBLIC_READ_TOKEN =
    "p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8";

/** One row of the community app directory synced from app.json. */
export type DirectoryApp = {
    emoji: string;
    name: string;
    web_url: string;
    screenshot_url: string;
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
    requests_24h: number | string | null;
};

/** Match the directory's deduplication rule; app names alone are not unique. */
export const appIdentity = (
    app: Pick<DirectoryApp, "name" | "web_url" | "github_repository_url">,
) => `${app.name.toLowerCase()}|${app.web_url || app.github_repository_url}`;

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

export const isPollen = (app: DirectoryApp) =>
    app.byop === true || app.byop === 1 || app.byop === "true";

/** Non-BYOP counts belong to the developer, not the app; never rank by them. */
export function byopRequests24h(app: DirectoryApp): number | null {
    if (
        !isPollen(app) ||
        app.requests_24h == null ||
        String(app.requests_24h).trim() === ""
    ) {
        return null;
    }
    const requests = Number(app.requests_24h);
    return Number.isFinite(requests) && requests >= 0 ? requests : null;
}

/** Measured usage first, including zero; unknown usage stays unranked at the end. */
export const compareAppUsage = (a: DirectoryApp, b: DirectoryApp) =>
    (byopRequests24h(b) ?? -1) - (byopRequests24h(a) ?? -1);

/** Automatic card signals derived from BYOP traffic, wallet support, and recency. */
export const isBuzz = (app: DirectoryApp) => {
    const requests = byopRequests24h(app);
    return requests !== null && requests >= 100;
};
export const isFresh = (app: DirectoryApp, now = Date.now()) => {
    if (!app.approved_date) return false;
    const approved = new Date(app.approved_date).getTime();
    return Number.isFinite(approved) && approved >= now - THIRTY_DAYS_MS;
};

/** The community app directory; exact duplicates collapse, same-named apps stay. */
const loadDirectory = cachePublic(async () => {
    const rows = await tinybird<DirectoryApp>(
        "app_directory_public",
        "&limit=1000",
    );
    const seen = new Set<string>();
    return rows.filter((app) => {
        if (!app.name) return false;
        const key = appIdentity(app);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
});

export function useAppDirectory() {
    return useAsync<DirectoryApp[]>(loadDirectory, []);
}

export type WeeklyAppUsage = {
    app_url: string;
    app_name: string;
    owner: string;
    request_count: number;
};

/** Ranking is already filtered and aggregated per catalog listing on the server. */
export function selectWeeklyApps(
    catalog: DirectoryApp[],
    ranking: WeeklyAppUsage[],
): DirectoryApp[] {
    const seen = new Set<string>();
    return ranking
        .flatMap((row) => {
            const app = catalog.find(
                (candidate) =>
                    candidate.web_url === row.app_url &&
                    candidate.name === row.app_name &&
                    candidate.github_username.toLowerCase() ===
                        row.owner.toLowerCase(),
            );
            if (!app || !(row.request_count > 0)) return [];
            const identity = appIdentity(app);
            if (seen.has(identity)) return [];
            seen.add(identity);
            // Verified BYOP traffic is stronger evidence than the daily catalog flag.
            // Do not relabel a stale developer-wide daily count as BYOP usage.
            return [{ ...app, requests_24h: byopRequests24h(app), byop: true }];
        })
        .slice(0, 8);
}

export const loadWeeklyApps = cachePublic(async () => {
    const [catalog, ranking] = await Promise.all([
        loadDirectory(),
        tinybird<WeeklyAppUsage>("app_top_weekly", "&limit=8"),
    ]);
    return selectWeeklyApps(catalog, ranking);
});

export function useWeeklyApps() {
    return useAsync<DirectoryApp[]>(loadWeeklyApps, []);
}

/** The same cached catalog serves discovery, the active showcase, and counts. */
export function useAppShowcase() {
    const directory = useAppDirectory();
    return {
        ...directory,
        data: selectShowcaseApps(directory.data),
        total: directory.data.length,
    };
}

export function selectShowcaseApps(apps: DirectoryApp[]): DirectoryApp[] {
    return apps
        .filter((app) => app.description && isBuzz(app))
        .sort(
            (left, right) =>
                compareAppUsage(left, right) ||
                right.approved_date.localeCompare(left.approved_date),
        )
        .slice(0, 8);
}

type PlatformStats = {
    /** Callable models excluding agents; official and community entries included. */
    models: number;
    /** Callable agents, counted separately from models. */
    agents: number;
    /** Count per category, e.g. { text: 141, image: 51 }. */
    byCategory: Record<string, number>;
    /** Models and agents explicitly marked as community-published by the catalog. */
    community: number;
};

type CatalogModel = {
    category?: string;
    agent?: boolean;
    community?: boolean;
};

function summariseCatalog(models: CatalogModel[]) {
    const byCategory: Record<string, number> = {};
    let community = 0;
    for (const model of models) {
        const category = model.category ?? "other";
        byCategory[category] = (byCategory[category] ?? 0) + 1;
        if (model.community === true) {
            community += 1;
        }
    }
    return { byCategory, community };
}

const MODEL_KIND_LABELS: Record<string, string> = {
    embedding: "embeddings",
    "3d": "3D",
};

/**
 * The catalog's model categories as a sentence, largest first — e.g.
 * "Text, image, audio, video, embeddings, realtime and 3D". A new category
 * appears on the homepage as soon as the catalog lists it.
 */
export function describeModelKinds(
    byCategory: Record<string, number>,
): string | null {
    const kinds = Object.entries(byCategory)
        .filter(([category]) => category !== "other")
        .sort(([, left], [, right]) => right - left)
        .map(([category]) => MODEL_KIND_LABELS[category] ?? category);
    if (kinds.length === 0) return null;
    const list =
        kinds.length > 1
            ? `${kinds.slice(0, -1).join(", ")} and ${kinds[kinds.length - 1]}`
            : kinds[0];
    return list.charAt(0).toUpperCase() + list.slice(1);
}

/**
 * Shared across the dev kit and Community so each mount reuses the cached
 * catalog and platform statistics instead of repeating their requests.
 */
export function usePlatformStats() {
    return useAsync<PlatformStats | null>(loadPlatformStats, null);
}

/** Only request the catalog used by the visible counts and model categories. */
export const loadPlatformStats = cachePublic(
    async (): Promise<PlatformStats> => {
        const response = await fetch("https://gen.pollinations.ai/models");
        if (!response.ok) throw new Error(`models: ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body)) throw new Error("models: invalid catalog");
        const catalog = body as CatalogModel[];
        return {
            models: catalog.filter((model) => model.agent !== true).length,
            agents: catalog.filter((model) => model.agent === true).length,
            ...summariseCatalog(catalog),
        };
    },
);

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
