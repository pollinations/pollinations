import { Hono } from "hono";
import { cors } from "hono/cors";

// Data start date - Oct 1, 2025
const DATA_START_DATE = "2025-10-01";
const DATA_START_TIMESTAMP_MS = new Date(DATA_START_DATE).getTime();
const DATA_START_TIMESTAMP_SEC = Math.floor(DATA_START_TIMESTAMP_MS / 1000);

const MAX_WEEKS_BACK = 20;

type Env = {
    TINYBIRD_READ_TOKEN: string;
    TINYBIRD_API: string;
    GITHUB_TOKEN?: string;
    GITHUB_REPO: string;
    DASHBOARD_PASSWORD?: string;
    ASSETS: Fetcher;
};

// Helper to fetch from Tinybird with caching, retry, and error logging
// Uses Cloudflare Cache API to avoid hammering Tinybird on concurrent page loads
const TINYBIRD_CACHE_TTL = 21600; // 6 hours — weekly data barely changes
// Part of the cache key, not the request. A pipe that gains a column keeps
// serving the old shape for TINYBIRD_CACHE_TTL because a Worker redeploy does
// not touch caches.default — bump this in the same commit as the pipe change.
const TINYBIRD_CACHE_VERSION = "3";

async function fetchTinybird(
    env: Env,
    pipe: string,
    params: Record<string, string | number> = {},
): Promise<{
    data: unknown[];
    error?: string;
    status?: number;
    pipe?: string;
}> {
    const query = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
        query.set(k, String(v));
    }
    const url = `${env.TINYBIRD_API}/v0/pipes/${pipe}.json?${query}`;

    // Check Cloudflare edge cache first
    const cache = caches.default;
    const cacheKey = new Request(`${url}&__v=${TINYBIRD_CACHE_VERSION}`);
    const cached = await cache.match(cacheKey);
    if (cached) {
        const json = (await cached.json()) as { data: unknown[] };
        return { data: json.data };
    }

    const headers = { Authorization: `Bearer ${env.TINYBIRD_READ_TOKEN}` };

    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const res = await fetch(url, { headers });
            if (res.ok) {
                const json = (await res.json()) as { data: unknown[] };
                // Cache successful responses at the edge
                const cacheResponse = new Response(JSON.stringify(json), {
                    headers: {
                        "Cache-Control": `public, max-age=${TINYBIRD_CACHE_TTL}`,
                    },
                });
                await cache.put(cacheKey, cacheResponse);
                return { data: json.data };
            }
            const body = await res.text();
            const errorDetail = `pipe=${pipe} params=${JSON.stringify(params)} status=${res.status} body=${body.slice(0, 500)}`;
            console.error(
                `[Tinybird] FAILED attempt ${attempt + 1}/2: ${errorDetail}`,
            );
            // Retry on 408 (timeout), 429 (rate limit), or 5xx
            if (
                attempt === 0 &&
                (res.status === 408 || res.status === 429 || res.status >= 500)
            ) {
                const delay = res.status === 429 ? 2000 : 1000;
                console.error(
                    `[Tinybird] Retrying ${pipe} in ${delay}ms (status=${res.status})`,
                );
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            return {
                data: [],
                error: `Tinybird ${res.status}: ${body.slice(0, 300)}`,
                status: res.status,
                pipe,
            };
        } catch (e) {
            console.error(
                `[Tinybird] NETWORK ERROR attempt ${attempt + 1}/2: pipe=${pipe} error=${e}`,
            );
            if (attempt === 0) {
                await new Promise((r) => setTimeout(r, 1000));
                continue;
            }
            return { data: [], error: `Network error: ${e}`, pipe };
        }
    }
    return { data: [], error: "Exhausted retries", pipe };
}

// Get ISO Monday dates for each week going back N weeks
function getWeekMondays(weeksBack: number): string[] {
    const mondays: string[] = [];
    const now = new Date();
    // Current week's Monday
    const today = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    const dayOfWeek = today.getUTCDay();
    const currentMonday = new Date(today);
    currentMonday.setUTCDate(
        today.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1),
    );

    for (let i = weeksBack; i >= 0; i--) {
        const monday = new Date(currentMonday);
        monday.setUTCDate(currentMonday.getUTCDate() - i * 7);
        mondays.push(monday.toISOString().split("T")[0]);
    }
    return mondays;
}

// Fetch a Tinybird pipe week-by-week (serial) and merge results.
// Each call queries a single week via start_date, avoiding the 10s timeout.
async function fetchTinybirdByWeek(
    env: Env,
    pipe: string,
    weeksBack: number,
): Promise<{ data: unknown[]; errors: string[] }> {
    const mondays = getWeekMondays(weeksBack);
    const allData: unknown[] = [];
    const errors: string[] = [];

    for (const monday of mondays) {
        const result = await fetchTinybird(env, pipe, {
            start_date: monday,
        });
        if (result.error) {
            errors.push(`${monday}: ${result.error}`);
        }
        if (result.data.length > 0) {
            allData.push(...result.data);
        }
    }
    return { data: allData, errors };
}

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

// Basic Auth middleware — password set via `wrangler secret put DASHBOARD_PASSWORD`
app.use("*", async (c, next) => {
    const password = c.env.DASHBOARD_PASSWORD;
    if (!password) {
        return new Response("Dashboard password not configured", {
            status: 500,
        });
    }

    const auth = c.req.header("Authorization");
    if (auth) {
        const [scheme, encoded] = auth.split(" ");
        if (scheme === "Basic" && encoded) {
            const decoded = atob(encoded);
            const [, pwd] = decoded.split(":");
            if (pwd === password) return next();
        }
    }

    return new Response("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="KPI Dashboard"' },
    });
});

// Tinybird: Weekly registrations (from Oct 1, 2025)
app.get("/api/kpi/registrations", async (c) => {
    const result = await fetchTinybird(c.env, "kpi_registrations", {
        min_created_at: DATA_START_TIMESTAMP_SEC,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// D7 Activations: users who made their first API request within 7 days of registration
// Fully computed in Tinybird by joining d1_user with generation_event_v2
app.get("/api/kpi/activations", async (c) => {
    const result = await fetchTinybird(c.env, "kpi_activations", {
        min_created_at: DATA_START_TIMESTAMP_SEC,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// Helper: parse weeks_back from query, capped at MAX_WEEKS_BACK
function parseWeeksBack(
    c: { req: { query: (k: string) => string | undefined } },
    fallback = 12,
): number {
    const raw = c.req.query("weeks_back");
    const parsed = raw ? parseInt(raw, 10) : fallback;
    return Math.min(Number.isNaN(parsed) ? fallback : parsed, MAX_WEEKS_BACK);
}

// Tinybird: WAU — fetched week-by-week to avoid 10s timeout
app.get("/api/kpi/wau", async (c) => {
    const result = await fetchTinybirdByWeek(
        c.env,
        "weekly_active_users",
        parseWeeksBack(c),
    );
    return c.json({ data: result.data });
});

// Tinybird: Usage stats — fetched week-by-week to avoid 10s timeout
app.get("/api/kpi/usage", async (c) => {
    const result = await fetchTinybirdByWeek(
        c.env,
        "weekly_usage_stats",
        parseWeeksBack(c),
    );
    return c.json({ data: result.data });
});

// Tinybird: Retention — multi-week cohort query, cannot split by week
app.get("/api/kpi/retention", async (c) => {
    const result = await fetchTinybird(c.env, "weekly_retention", {
        weeks_back: parseWeeksBack(c, 8),
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// Tinybird: Health stats — fetched week-by-week to avoid 10s timeout
app.get("/api/kpi/health", async (c) => {
    const result = await fetchTinybirdByWeek(
        c.env,
        "weekly_health_stats",
        parseWeeksBack(c),
    );
    return c.json({ data: result.data });
});

// Helper: Get Monday of the week for a date (ISO week starts on Monday)
function getWeekStart(date: Date): string {
    const dayOfWeek = date.getUTCDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate() + mondayOffset,
        ),
    );
    return monday.toISOString().split("T")[0];
}

// Tinybird: Fetch and aggregate daily Stripe revenue into weekly
async function fetchStripeRevenue(
    env: Env,
): Promise<Array<{ week: string; revenue: number; purchases: number }>> {
    const daysBack = 90;
    const result = await fetchTinybird(env, "daily_stripe_revenue", {
        days_back: daysBack,
    });
    if (result.error) return [];

    const data = { data: result.data } as {
        data: Array<{ date: string; revenue: number; purchases: number }>;
    };

    // Aggregate daily data into weekly
    const weeklyData: Record<string, { revenue: number; purchases: number }> =
        {};

    for (const row of data.data) {
        const date = new Date(row.date);
        const weekStart = getWeekStart(date);

        if (!weeklyData[weekStart]) {
            weeklyData[weekStart] = { revenue: 0, purchases: 0 };
        }
        weeklyData[weekStart].revenue += row.revenue;
        weeklyData[weekStart].purchases += row.purchases;
    }

    return Object.entries(weeklyData)
        .map(([week, d]) => ({ week, ...d }))
        .sort((a, b) => a.week.localeCompare(b.week));
}

app.get("/api/kpi/revenue", async (c) => {
    const result = (await fetchStripeRevenue(c.env)).map((row) => ({
        ...row,
        revenue: Math.round(row.revenue * 100) / 100,
    }));

    return c.json({ data: result });
});

// Tinybird: B2B/B2C User Segments — fetched week-by-week to avoid 10s timeout
app.get("/api/kpi/user-segments", async (c) => {
    const result = await fetchTinybirdByWeek(
        c.env,
        "weekly_user_segment",
        parseWeeksBack(c),
    );
    return c.json({ data: result.data });
});

function githubHeaders(env: Env): Record<string, string> {
    const headers: Record<string, string> = {
        "User-Agent": "KPI-Dashboard",
        Accept: "application/vnd.github+json",
    };
    if (env.GITHUB_TOKEN) {
        headers.Authorization = `token ${env.GITHUB_TOKEN}`;
    }
    return headers;
}

// GitHub: App submissions — weekly counts from issue labels
app.get("/api/kpi/app-submissions", async (c) => {
    const headers = githubHeaders(c.env);

    const repo = c.env.GITHUB_REPO;
    const since = DATA_START_DATE;
    const weeklySubmissions: Record<string, number> = {};
    let page = 1;
    let itemCount = 0;
    do {
        const res = await fetch(
            `https://api.github.com/repos/${repo}/issues?state=all&labels=APP-SUBMISSION&since=${since}T00:00:00Z&per_page=100&page=${page}`,
            { headers },
        );
        if (!res.ok) {
            // Was `break`, which returned an empty list — a dead token, a rate
            // limit and a quiet week all looked identical on the dashboard.
            const body = await res.text();
            const detail = `status=${res.status} body=${body.slice(0, 300)}`;
            console.error(`[GitHub] app-submissions failed: ${detail}`);
            return c.json({ error: `GitHub ${res.status}`, data: [] }, 502);
        }
        const data = (await res.json()) as Array<{
            created_at: string;
            pull_request?: unknown;
        }>;
        itemCount = data.length;
        for (const issue of data) {
            if (issue.pull_request) continue;
            const createdAt = new Date(issue.created_at);
            if (createdAt.getTime() < DATA_START_TIMESTAMP_MS) continue;
            const week = getWeekStart(createdAt);
            weeklySubmissions[week] = (weeklySubmissions[week] || 0) + 1;
        }
        page++;
    } while (itemCount === 100);

    const result = Object.entries(weeklySubmissions)
        .map(([week, submitted]) => ({ week, submitted }))
        .sort((a, b) => a.week.localeCompare(b.week));

    return c.json({ data: result });
});

// GitHub: Stars
app.get("/api/kpi/github", async (c) => {
    const headers = githubHeaders(c.env);

    const res = await fetch(
        `https://api.github.com/repos/${c.env.GITHUB_REPO}`,
        { headers },
    );

    if (!res.ok) return c.json({ stars: 0, forks: 0, error: true });

    const data = (await res.json()) as {
        stargazers_count: number;
        forks_count: number;
        subscribers_count: number;
    };
    return c.json({
        stars: data.stargazers_count || 0,
        forks: data.forks_count || 0,
        watchers: data.subscribers_count || 0,
    });
});

// Everything else is the SPA shell, served from the assets binding once the
// Basic-auth middleware above has let the request through.
app.get("*", (c) => c.env.ASSETS.fetch(c.req.raw));

export default app;
