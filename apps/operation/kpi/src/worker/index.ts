import manifestJSON from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import { Hono } from "hono";
import { cors } from "hono/cors";

const assetManifest = JSON.parse(manifestJSON);

// Data start date - Oct 1, 2025
const DATA_START_DATE = "2025-10-01";
const DATA_START_TIMESTAMP_MS = new Date(DATA_START_DATE).getTime();
const DATA_START_TIMESTAMP_SEC = Math.floor(DATA_START_TIMESTAMP_MS / 1000);

const MAX_WEEKS_BACK = 20;

type Env = {
    TINYBIRD_TOKEN: string;
    TINYBIRD_API: string;
    POLAR_ACCESS_TOKEN: string;
    POLAR_API: string;
    GITHUB_TOKEN?: string;
    GITHUB_APP_ID?: string;
    GITHUB_APP_PRIVATE_KEY?: string;
    GITHUB_APP_INSTALLATION_ID?: string;
    GITHUB_REPO: string;
    DASHBOARD_PASSWORD?: string;
    __STATIC_CONTENT: KVNamespace;
};

// Helper to fetch from Tinybird with caching, retry, and error logging
// Uses Cloudflare Cache API to avoid hammering Tinybird on concurrent page loads
const TINYBIRD_CACHE_TTL = 21600; // 6 hours — weekly data barely changes

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

// Tinybird: Weekly registrations (from Oct 1, 2025)
app.get("/api/kpi/registrations", async (c) => {
    const result = await fetchTinybird(c.env, "kpi_registrations", {
        min_created_at: DATA_START_TIMESTAMP_SEC,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// Tinybird: Total users (from Oct 1, 2025)
app.get("/api/kpi/total-users", async (c) => {
    const result = await fetchTinybird(c.env, "kpi_total_users", {
        min_created_at: DATA_START_TIMESTAMP_SEC,
    });
    if (result.error) return c.json({ error: result.error, total: 0 }, 500);
    const row = result.data[0] as { total: number } | undefined;
    return c.json({ total: row?.total || 0 });
});

// Tinybird: Tier distribution (from Oct 1, 2025)
app.get("/api/kpi/tiers", async (c) => {
    const result = await fetchTinybird(c.env, "kpi_tier_distribution", {
        min_created_at: DATA_START_TIMESTAMP_SEC,
    });
    if (result.error) return c.json({ error: result.error, data: [] }, 500);
    return c.json({ data: result.data });
});

// D7 Activations: users who made their first API request within 7 days of registration
// Fully computed in Tinybird by joining d1_user with generation_event
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

// GitHub App JWT auth for higher rate limits (15k/hr vs 5k/hr)
// Falls back to GITHUB_TOKEN (PAT) if app credentials aren't configured
async function getGitHubToken(env: Env): Promise<string | null> {
    // Try GitHub App auth first
    if (
        env.GITHUB_APP_ID &&
        env.GITHUB_APP_PRIVATE_KEY &&
        env.GITHUB_APP_INSTALLATION_ID
    ) {
        try {
            const now = Math.floor(Date.now() / 1000);
            const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }))
                .replace(/=/g, "")
                .replace(/\+/g, "-")
                .replace(/\//g, "_");
            const payload = btoa(
                JSON.stringify({
                    iat: now - 30,
                    exp: now + 600,
                    iss: env.GITHUB_APP_ID,
                }),
            )
                .replace(/=/g, "")
                .replace(/\+/g, "-")
                .replace(/\//g, "_");

            // Import RSA private key for signing
            const pemBody = env.GITHUB_APP_PRIVATE_KEY.replace(
                /-----BEGIN RSA PRIVATE KEY-----/,
                "",
            )
                .replace(/-----END RSA PRIVATE KEY-----/, "")
                .replace(/\s/g, "");
            const binaryKey = Uint8Array.from(atob(pemBody), (c) =>
                c.charCodeAt(0),
            );
            const cryptoKey = await crypto.subtle.importKey(
                "pkcs8",
                binaryKey,
                { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
                false,
                ["sign"],
            );

            const sigData = new TextEncoder().encode(`${header}.${payload}`);
            const signature = await crypto.subtle.sign(
                "RSASSA-PKCS1-v1_5",
                cryptoKey,
                sigData,
            );
            const sig = btoa(String.fromCharCode(...new Uint8Array(signature)))
                .replace(/=/g, "")
                .replace(/\+/g, "-")
                .replace(/\//g, "_");

            const jwtToken = `${header}.${payload}.${sig}`;

            // Exchange JWT for installation token
            const res = await fetch(
                `https://api.github.com/app/installations/${env.GITHUB_APP_INSTALLATION_ID}/access_tokens`,
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${jwtToken}`,
                        Accept: "application/vnd.github+json",
                        "User-Agent": "KPI-Dashboard",
                    },
                },
            );

            if (res.ok) {
                const data = (await res.json()) as { token: string };
                return data.token;
            }
            console.error(`[GitHub App] Token exchange failed: ${res.status}`);
        } catch (e) {
            console.error(
                `[GitHub App] Auth failed, falling back to PAT: ${e}`,
            );
        }
    }

    return env.GITHUB_TOKEN || null;
}

// GitHub: App submissions — weekly counts from issue labels
app.get("/api/kpi/app-submissions", async (c) => {
    const token = await getGitHubToken(c.env);
    const headers: Record<string, string> = {
        "User-Agent": "KPI-Dashboard",
        Accept: "application/vnd.github+json",
    };
    if (token) headers.Authorization = `token ${token}`;

    // Fetch all TIER-APP issues (submissions) and TIER-APP-COMPLETE issues (approved)
    // GitHub Search API lets us get created/closed dates with labels in one call
    const repo = c.env.GITHUB_REPO;
    const since = DATA_START_DATE;

    // TIER-APP label gets replaced as issues progress, so search each label separately
    // GitHub Search API treats comma-separated labels as AND, not OR
    const labels = [
        "TIER-APP",
        "TIER-APP-REVIEW",
        "TIER-APP-APPROVED",
        "TIER-APP-COMPLETE",
        "TIER-APP-REJECTED",
        "TIER-APP-INCOMPLETE",
    ];
    const seenIssues = new Set<number>();
    const weeklySubmissions: Record<string, number> = {};

    for (const label of labels) {
        const query = `repo:${repo}+is:issue+label:${label}+created:>=${since}`;
        let page = 1;
        let totalCount = 0;
        do {
            const res = await fetch(
                `https://api.github.com/search/issues?q=${query}&per_page=100&sort=created&order=asc&page=${page}`,
                { headers },
            );
            if (!res.ok) break;
            const data = (await res.json()) as {
                total_count: number;
                items: Array<{ number: number; created_at: string }>;
            };
            totalCount = data.total_count;
            for (const issue of data.items) {
                if (seenIssues.has(issue.number)) continue;
                seenIssues.add(issue.number);
                const week = getWeekStart(new Date(issue.created_at));
                weeklySubmissions[week] = (weeklySubmissions[week] || 0) + 1;
            }
            page++;
        } while ((page - 1) * 100 < totalCount && page <= 5);
    }

    const result = Object.entries(weeklySubmissions)
        .map(([week, submitted]) => ({ week, submitted }))
        .sort((a, b) => a.week.localeCompare(b.week));

    return c.json({ data: result });
});

// GitHub: Stars
app.get("/api/kpi/github", async (c) => {
    const token = await getGitHubToken(c.env);
    const headers: Record<string, string> = {
        "User-Agent": "KPI-Dashboard",
    };
    if (token) {
        headers.Authorization = `token ${token}`;
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
