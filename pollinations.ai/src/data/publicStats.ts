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
    name: string;
    web_url: string;
    screenshot_url: string;
    description: string;
    category: string;
    platform: string;
    github_username: string;
    github_repository_url: string;
    github_repository_stars: string;
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
export const isFresh = (app: DirectoryApp) => {
    if (!app.approved_date) return false;
    const approved = new Date(app.approved_date).getTime();
    return Number.isFinite(approved) && approved >= Date.now() - THIRTY_DAYS_MS;
};

export const newestFirst = (a: DirectoryApp, b: DirectoryApp) =>
    (b.approved_date || "").localeCompare(a.approved_date || "");

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
            if (!app) return [];
            const identity = appIdentity(app);
            if (seen.has(identity)) return [];
            seen.add(identity);
            return [app];
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

/** Hello and Apps use the exact same cached seven-day BYOP ranking. */
export function useWeeklyApps() {
    return useAsync<DirectoryApp[]>(loadWeeklyApps, []);
}

const loadNewestApps = cachePublic(async () =>
    [...(await loadDirectory())].sort(newestFirst).slice(0, 8),
);

export function useNewestApps() {
    return useAsync<DirectoryApp[]>(loadNewestApps, []);
}

type PlatformStats = {
    /** Callable agents, counted separately from models. */
    agents: number;
    /**
     * Models explicitly marked as community-published by the catalog, agents
     * excluded. The public catalog already leaves out unreliable ones.
     */
    community: number;
    /** Official models per catalog category, e.g. { image: 42, text: 99 }. */
    kinds: Record<string, number>;
    /**
     * Up to two newest model titles per group, from different publishers:
     * official general-purpose models by category, community models under
     * `community`.
     */
    newest: Record<string, string[]>;
};

type CatalogModel = {
    name: string;
    title?: string;
    agent?: boolean;
    community?: boolean;
    category?: string;
    publisher?: string;
    /** Epoch milliseconds. */
    added_date?: number;
    is_specialized?: boolean;
};

/**
 * Shared across the dev kit and Community so each mount reuses the cached
 * catalog and platform statistics instead of repeating their requests.
 */
export function usePlatformStats() {
    return useAsync<PlatformStats | null>(loadPlatformStats, null);
}

/** Only request the catalog used by the visible counts. */
export const loadPlatformStats = cachePublic(
    async (): Promise<PlatformStats> => {
        const response = await fetch("https://gen.pollinations.ai/models");
        if (!response.ok) throw new Error(`models: ${response.status}`);
        const body = await response.json();
        if (!Array.isArray(body)) throw new Error("models: invalid catalog");
        const catalog = body as CatalogModel[];
        const models = catalog.filter((model) => model.agent !== true);
        const official = models.filter((model) => model.community !== true);
        const kinds: Record<string, number> = {};
        for (const { category } of official) {
            if (category) kinds[category] = (kinds[category] ?? 0) + 1;
        }
        return {
            agents: catalog.length - models.length,
            community: models.length - official.length,
            kinds,
            newest: newestByGroup(models),
        };
    },
);

function newestByGroup(models: CatalogModel[]) {
    const newest: Record<string, string[]> = {};
    // One model per publisher, so a model and its variant don't fill the pair.
    const seen = new Set<string>();
    const sorted = models
        .filter((model) => !model.is_specialized)
        .sort((a, b) => (b.added_date ?? 0) - (a.added_date ?? 0));
    for (const model of sorted) {
        const group = model.community === true ? "community" : model.category;
        if (!group || seen.has(`${group}/${model.publisher}`)) continue;
        seen.add(`${group}/${model.publisher}`);
        newest[group] = [
            ...(newest[group] ?? []),
            model.title ?? model.name,
        ].slice(0, 2);
    }
    return newest;
}

/** Names of the hosted MCP servers, in the order gen lists them. */
export const loadMcpServers = cachePublic(async (): Promise<string[]> => {
    const response = await fetch("https://gen.pollinations.ai/mcp");
    if (!response.ok) throw new Error(`mcp: ${response.status}`);
    const body = (await response.json()) as { data?: { name: string }[] };
    return (body.data ?? []).map((server) => server.name);
});

export function useMcpServers() {
    return useAsync<string[]>(loadMcpServers, []);
}

/** Requests gen settled in the last hour, across every model. */
export const loadRequestsLastHour = cachePublic(async (): Promise<number> => {
    const response = await fetch(
        "https://gen.pollinations.ai/models/status?minutes=60",
    );
    if (!response.ok) throw new Error(`models/status: ${response.status}`);
    const body = (await response.json()) as {
        data?: { is_rollup: number; total_requests: number }[];
    };
    // A model's rollup row counts each request once; its route rows also
    // count the attempts that were retried on a fallback.
    return (body.data ?? [])
        .filter((row) => row.is_rollup === 1)
        .reduce((sum, row) => sum + row.total_requests, 0);
});

export function useRequestsLastHour() {
    return useAsync<number | null>(loadRequestsLastHour, null);
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
