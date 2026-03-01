import manifestJSON from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import { Hono } from "hono";
import { cors } from "hono/cors";

const assetManifest = JSON.parse(manifestJSON);

// Data start date - Oct 1, 2025
const DATA_START_DATE = "2025-10-01";
const DATA_START_TIMESTAMP_MS = new Date(DATA_START_DATE).getTime();
const DATA_START_TIMESTAMP_SEC = Math.floor(DATA_START_TIMESTAMP_MS / 1000); // D1 uses seconds

const MAX_WEEKS_BACK = 20;

type Env = {
    DB?: D1Database;
    CF_API_TOKEN: string;
    D1_ACCOUNT_ID: string;
    D1_DATABASE_ID: string;
    TINYBIRD_TOKEN: string;
    TINYBIRD_API: string;
    POLAR_ACCESS_TOKEN: string;
    POLAR_API: string;
    GITHUB_TOKEN?: string;
    GITHUB_REPO: string;
    DASHBOARD_PASSWORD?: string;
    __STATIC_CONTENT: KVNamespace;
};

// Helper to query D1 via HTTP API (cross-account)
async function queryD1(env: Env, sql: string, params: unknown[] = []) {
    const url = `https://api.cloudflare.com/client/v4/accounts/${env.D1_ACCOUNT_ID}/d1/database/${env.D1_DATABASE_ID}/query`;
    const res = await fetch(url, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${env.CF_API_TOKEN}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql, params }),
    });
    if (!res.ok) {
        const err = await res.text();
        throw new Error(`D1 API error: ${err}`);
    }
    const data = (await res.json()) as {
        result: Array<{ results: unknown[] }>;
    };
    return data.result?.[0]?.results || [];
}

// Helper to fetch from Tinybird with caching, retry, and error logging
// Uses Cloudflare Cache API to avoid hammering Tinybird on concurrent page loads
const TINYBIRD_CACHE_TTL = 300; // 5 minutes — weekly data barely changes

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
    const cacheKey = new Request(url);
    const cached = await cache.match(cacheKey);
    if (cached) {
        const json = (await cached.json()) as { data: unknown[] };
        return { data: json.data };
    }

    const headers = { Authorization: `Bearer ${env.TINYBIRD_TOKEN}` };

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
// If no password is set, the dashboard is public (backward compatible)
app.use("*", async (c, next) => {
    const password = c.env.DASHBOARD_PASSWORD;
    if (!password) return next();

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

// Health check
app.get("/api/health", (c) => c.json({ status: "ok" }));

// D1: Weekly registrations (from Oct 1, 2025)
app.get("/api/kpi/registrations", async (c) => {
    try {
        const results = await queryD1(
            c.env,
            `
            SELECT 
                date(datetime(created_at, 'unixepoch'), '-' || ((strftime('%w', datetime(created_at, 'unixepoch')) + 6) % 7) || ' days') AS week_start,
                COUNT(*) as registrations
            FROM user 
            WHERE created_at >= ?1
            GROUP BY week_start
            ORDER BY week_start ASC
        `,
            [DATA_START_TIMESTAMP_SEC],
        );
        return c.json({ data: results });
    } catch (e) {
        return c.json({ error: String(e), data: [] }, 500);
    }
});

// D1: Total users (from Oct 1, 2025)
app.get("/api/kpi/total-users", async (c) => {
    try {
        const results = await queryD1(
            c.env,
            "SELECT COUNT(*) as total FROM user WHERE created_at >= ?1",
            [DATA_START_TIMESTAMP_SEC],
        );
        const row = results[0] as { total: number } | undefined;
        return c.json({ total: row?.total || 0 });
    } catch (e) {
        return c.json({ error: String(e), total: 0 }, 500);
    }
});

// D1: Tier distribution (from Oct 1, 2025)
app.get("/api/kpi/tiers", async (c) => {
    try {
        const results = await queryD1(
            c.env,
            `
            SELECT tier, COUNT(*) as user_count
            FROM user 
            WHERE created_at >= ?1
            GROUP BY tier
            ORDER BY user_count DESC
        `,
            [DATA_START_TIMESTAMP_SEC],
        );
        return c.json({ data: results });
    } catch (e) {
        return c.json({ error: String(e), data: [] }, 500);
    }
});

// D7 Activations: Join D1 registrations with Tinybird first activity
// A user is "activated" if they made their first API request within 7 days of registration
app.get("/api/kpi/activations", async (c) => {
    try {
        const weeksBack = parseWeeksBack(c);

        // 1. Get all user registrations from D1 (id, created_at, week_start)
        const registrations = (await queryD1(
            c.env,
            `
            SELECT 
                id as user_id,
                created_at,
                date(datetime(created_at, 'unixepoch'), '-' || ((strftime('%w', datetime(created_at, 'unixepoch')) + 6) % 7) || ' days') AS registration_week
            FROM user 
            WHERE created_at >= ?1
        `,
            [DATA_START_TIMESTAMP_SEC],
        )) as Array<{
            user_id: string;
            created_at: number;
            registration_week: string;
        }>;

        // 2. Get first activity per user from Tinybird
        const tinybirdResult = await fetchTinybird(
            c.env,
            "weekly_activations",
            { weeks_back: weeksBack },
        );
        if (tinybirdResult.error) {
            return c.json({ error: tinybirdResult.error, data: [] }, 500);
        }

        const tinybirdData = { data: tinybirdResult.data } as {
            data: Array<{
                user_id: string;
                first_activity_date: string;
                first_activity_week: string;
            }>;
        };

        // 3. Create lookup map for first activity by user_id
        const firstActivityMap = new Map<string, string>();
        for (const row of tinybirdData.data) {
            firstActivityMap.set(row.user_id, row.first_activity_date);
        }

        // 4. Calculate D7 activations per registration week
        const weeklyActivations: Record<string, number> = {};

        for (const reg of registrations) {
            const regWeek = reg.registration_week;
            if (!weeklyActivations[regWeek]) {
                weeklyActivations[regWeek] = 0;
            }

            // Check if user has any activity
            const firstActivityDate = firstActivityMap.get(reg.user_id);
            if (firstActivityDate) {
                // Calculate days between registration and first activity
                const regDate = new Date(reg.created_at * 1000);
                const activityDate = new Date(firstActivityDate);
                const daysDiff = Math.floor(
                    (activityDate.getTime() - regDate.getTime()) /
                        (1000 * 60 * 60 * 24),
                );

                // D7 activation: first activity within 7 days of registration
                if (daysDiff >= 0 && daysDiff <= 7) {
                    weeklyActivations[regWeek]++;
                }
            }
        }

        // 5. Convert to array format
        const result = Object.entries(weeklyActivations)
            .map(([week, activations]) => ({ week, activations }))
            .sort((a, b) => a.week.localeCompare(b.week));

        return c.json({ data: result });
    } catch (e) {
        return c.json({ error: String(e), data: [] }, 500);
    }
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

// Tinybird: Daily Stripe revenue (aggregated from checkout events)
app.get("/api/kpi/stripe-revenue", async (c) => {
    const daysBack = 90; // ~12 weeks
    const result = await fetchTinybird(c.env, "daily_stripe_revenue", {
        days_back: daysBack,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// Polar: Revenue (one-time pollen purchases only) - legacy, being phased out
async function fetchPolarRevenue(
    env: Env,
): Promise<Array<{ week: string; revenue: number; purchases: number }>> {
    const allOrders: Array<{
        status: string;
        created_at: string;
        amount: number;
    }> = [];
    let page = 1;
    const maxPages = 5;

    while (page <= maxPages) {
        const res = await fetch(
            `${env.POLAR_API}/v1/orders?limit=100&product_billing_type=one_time&page=${page}`,
            {
                headers: {
                    Authorization: `Bearer ${env.POLAR_ACCESS_TOKEN}`,
                    "Content-Type": "application/json",
                },
                redirect: "follow",
            },
        );

        if (!res.ok) break;

        const data = (await res.json()) as {
            items: Array<{
                status: string;
                created_at: string;
                amount: number;
            }>;
            pagination: { total_count: number };
        };

        allOrders.push(...(data.items || []));

        if (
            allOrders.length >= data.pagination.total_count ||
            data.items.length === 0
        )
            break;
        page++;
    }

    const weeklyData: Record<string, { revenue: number; purchases: number }> =
        {};

    for (const order of allOrders) {
        if (order.status !== "paid") continue;
        if (order.amount === 0) continue;

        const date = new Date(order.created_at);
        if (date < new Date(DATA_START_DATE)) continue;

        const weekStart = getWeekStart(date);

        if (!weeklyData[weekStart]) {
            weeklyData[weekStart] = { revenue: 0, purchases: 0 };
        }
        weeklyData[weekStart].revenue += order.amount / 100;
        weeklyData[weekStart].purchases += 1;
    }

    return Object.entries(weeklyData)
        .map(([week, d]) => ({ week, ...d }))
        .sort((a, b) => a.week.localeCompare(b.week));
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

// Combined Revenue: Stripe (primary) + Polar (legacy)
app.get("/api/kpi/revenue", async (c) => {
    // Fetch both sources in parallel
    const [stripeRevenue, polarRevenue] = await Promise.all([
        fetchStripeRevenue(c.env),
        fetchPolarRevenue(c.env),
    ]);

    // Merge by week, summing revenue and purchases
    const weeklyData: Record<string, { revenue: number; purchases: number }> =
        {};

    for (const row of stripeRevenue) {
        if (!weeklyData[row.week]) {
            weeklyData[row.week] = { revenue: 0, purchases: 0 };
        }
        weeklyData[row.week].revenue += row.revenue;
        weeklyData[row.week].purchases += row.purchases;
    }

    for (const row of polarRevenue) {
        if (!weeklyData[row.week]) {
            weeklyData[row.week] = { revenue: 0, purchases: 0 };
        }
        weeklyData[row.week].revenue += row.revenue;
        weeklyData[row.week].purchases += row.purchases;
    }

    const result = Object.entries(weeklyData)
        .map(([week, d]) => ({
            week,
            revenue: Math.round(d.revenue * 100) / 100,
            purchases: d.purchases,
        }))
        .sort((a, b) => a.week.localeCompare(b.week));

    return c.json({ data: result });
});

// Churn metrics derived from retention data
// Churn = 100 - w4_retention (% of users from 4 weeks ago who didn't return)
app.get("/api/kpi/churn", async (c) => {
    const weeksBack = 8; // retention data has limited weeks
    const result = await fetchTinybird(c.env, "weekly_retention", {
        weeks_back: weeksBack,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    const data = { data: result.data } as {
        data: Array<{
            cohort: string;
            cohort_size: number;
            w4_retained: number;
            w4_retention: number;
        }>;
    };

    // Transform retention data to churn data
    // Each cohort's w4_retention tells us what % returned after 4 weeks
    // Churn = 100 - w4_retention
    // Filter out cohorts that haven't had 4 weeks to mature (w4_retained = 0)
    const churnData = data.data
        .filter(
            (row) =>
                row.w4_retention !== null &&
                row.w4_retention !== undefined &&
                row.w4_retained > 0, // Only include cohorts with actual w4 data
        )
        .map((row) => ({
            week: row.cohort,
            users_4w_ago: row.cohort_size,
            churned_users: row.cohort_size - row.w4_retained,
            churn_rate: Math.round((100 - row.w4_retention) * 10) / 10,
        }));

    return c.json({ data: churnData });
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

// GitHub: Stars
app.get("/api/kpi/github", async (c) => {
    const headers: Record<string, string> = {
        "User-Agent": "KPI-Dashboard",
    };
    if (c.env.GITHUB_TOKEN) {
        headers.Authorization = `token ${c.env.GITHUB_TOKEN}`;
    }

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

// Combined: All KPIs in one call
app.get("/api/kpi/all", async (c) => {
    const [registrations, wau, usage, revenue, github] = await Promise.all([
        fetch(new URL("/api/kpi/registrations?weeks_back=12", c.req.url)).then(
            (r) => r.json(),
        ),
        fetch(new URL("/api/kpi/wau?weeks_back=12", c.req.url)).then((r) =>
            r.json(),
        ),
        fetch(new URL("/api/kpi/usage?weeks_back=12", c.req.url)).then((r) =>
            r.json(),
        ),
        fetch(new URL("/api/kpi/revenue", c.req.url)).then((r) => r.json()),
        fetch(new URL("/api/kpi/github", c.req.url)).then((r) => r.json()),
    ]);

    return c.json({ registrations, wau, usage, revenue, github });
});

// Serve static files for everything else
app.get("*", async (c) => {
    try {
        return await getAssetFromKV(
            {
                request: c.req.raw,
                waitUntil: (p) => c.executionCtx.waitUntil(p),
            },
            {
                ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
                ASSET_MANIFEST: assetManifest,
            },
        );
    } catch {
        // Try index.html for SPA routing
        try {
            const url = new URL(c.req.url);
            url.pathname = "/index.html";
            return await getAssetFromKV(
                {
                    request: new Request(url.toString(), c.req.raw),
                    waitUntil: (p) => c.executionCtx.waitUntil(p),
                },
                {
                    ASSET_NAMESPACE: c.env.__STATIC_CONTENT,
                    ASSET_MANIFEST: assetManifest,
                },
            );
        } catch {
            return c.text("Not found", 404);
        }
    }
});

export default app;
