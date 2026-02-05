import manifestJSON from "__STATIC_CONTENT_MANIFEST";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import { Hono } from "hono";
import { cors } from "hono/cors";

const assetManifest = JSON.parse(manifestJSON);

// Data start date - Oct 1, 2025
const DATA_START_DATE = "2025-10-01";
const DATA_START_TIMESTAMP_MS = new Date(DATA_START_DATE).getTime();
const DATA_START_TIMESTAMP_SEC = Math.floor(DATA_START_TIMESTAMP_MS / 1000); // D1 uses seconds

// Calculate weeks since start date for Tinybird queries
function getWeeksSinceStart(): number {
    const now = Date.now();
    const weeksMs = now - DATA_START_TIMESTAMP_MS;
    return Math.ceil(weeksMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

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

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors());

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
        const weeksBack = getWeeksSinceStart();

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
        const tinybirdRes = await fetch(
            `${c.env.TINYBIRD_API}/v0/pipes/weekly_activations.json?weeks_back=${weeksBack}`,
            { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
        );

        if (!tinybirdRes.ok) {
            return c.json({ error: "Tinybird error", data: [] }, 500);
        }

        const tinybirdData = (await tinybirdRes.json()) as {
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

// Tinybird: WAU (from Oct 1, 2025)
app.get("/api/kpi/wau", async (c) => {
    const weeksBack = getWeeksSinceStart();
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_active_users.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as { data: unknown[] };
    return c.json({ data: data.data });
});

// Tinybird: Usage stats (from Oct 1, 2025)
app.get("/api/kpi/usage", async (c) => {
    const weeksBack = getWeeksSinceStart();
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_usage_stats.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as { data: unknown[] };
    return c.json({ data: data.data });
});

// Tinybird: Retention (from Oct 1, 2025)
app.get("/api/kpi/retention", async (c) => {
    const weeksBack = getWeeksSinceStart();
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_retention.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as { data: unknown[] };
    return c.json({ data: data.data });
});

// Tinybird: Health stats - service availability (from Oct 1, 2025)
app.get("/api/kpi/health", async (c) => {
    const weeksBack = getWeeksSinceStart();
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_health_stats.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as { data: unknown[] };
    return c.json({ data: data.data });
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
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/daily_stripe_revenue.json?days_back=${daysBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as {
        data: Array<{ date: string; revenue: number; purchases: number }>;
    };
    return c.json({ data: data.data });
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
    const res = await fetch(
        `${env.TINYBIRD_API}/v0/pipes/daily_stripe_revenue.json?days_back=${daysBack}`,
        { headers: { Authorization: `Bearer ${env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return [];

    const data = (await res.json()) as {
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
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_retention.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as {
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
    const churnData = data.data
        .filter(
            (row) =>
                row.w4_retention !== null && row.w4_retention !== undefined,
        )
        .map((row) => ({
            week: row.cohort,
            users_4w_ago: row.cohort_size,
            churned_users: row.cohort_size - row.w4_retained,
            churn_rate: Math.round((100 - row.w4_retention) * 10) / 10,
        }));

    return c.json({ data: churnData });
});

// Tinybird: B2B/B2C User Segments (developer vs end-user)
app.get("/api/kpi/user-segments", async (c) => {
    const weeksBack = 12;
    const res = await fetch(
        `${c.env.TINYBIRD_API}/v0/pipes/weekly_user_segment.json?weeks_back=${weeksBack}`,
        { headers: { Authorization: `Bearer ${c.env.TINYBIRD_TOKEN}` } },
    );

    if (!res.ok) return c.json({ error: "Tinybird error", data: [] }, 500);
    const data = (await res.json()) as {
        data: Array<{
            week: string;
            developer_users: number;
            developer_pollen: number;
            developer_requests: number;
            enduser_users: number;
            enduser_pollen: number;
            enduser_requests: number;
            total_users: number;
            total_pollen: number;
            total_requests: number;
            enduser_user_pct: number;
            enduser_pollen_pct: number;
        }>;
    };
    return c.json({ data: data.data });
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
