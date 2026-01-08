import { Hono } from "hono";
import { cors } from "hono/cors";
import { getAssetFromKV } from "@cloudflare/kv-asset-handler";
import manifestJSON from "__STATIC_CONTENT_MANIFEST";

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

// Polar: Revenue (one-time pollen purchases only)
app.get("/api/kpi/revenue", async (c) => {
    // Paginate through all one-time purchases
    const allOrders: Array<{
        status: string;
        created_at: string;
        amount: number;
    }> = [];
    let page = 1;
    const maxPages = 5; // Safety limit

    while (page <= maxPages) {
        const res = await fetch(
            `${c.env.POLAR_API}/v1/orders?limit=100&product_billing_type=one_time&page=${page}`,
            {
                headers: {
                    Authorization: `Bearer ${c.env.POLAR_ACCESS_TOKEN}`,
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

        // Stop if we got all orders or no more items
        if (
            allOrders.length >= data.pagination.total_count ||
            data.items.length === 0
        )
            break;
        page++;
    }

    const orders = allOrders;

    // Group by week
    const weeklyData: Record<string, { revenue: number; purchases: number }> =
        {};

    for (const order of orders) {
        if (order.status !== "paid") continue;
        if (order.amount === 0) continue;

        const date = new Date(order.created_at);
        if (date < new Date(DATA_START_DATE)) continue; // Filter by start date

        // Get Monday of the week (ISO week starts on Monday)
        const dayOfWeek = date.getUTCDay();
        const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
        const monday = new Date(
            Date.UTC(
                date.getUTCFullYear(),
                date.getUTCMonth(),
                date.getUTCDate() + mondayOffset,
            ),
        );
        const weekStart = monday.toISOString().split("T")[0];

        if (!weeklyData[weekStart]) {
            weeklyData[weekStart] = { revenue: 0, purchases: 0 };
        }
        weeklyData[weekStart].revenue += order.amount / 100;
        weeklyData[weekStart].purchases += 1;
    }

    const result = Object.entries(weeklyData)
        .map(([week, d]) => ({ week, ...d }))
        .sort((a, b) => a.week.localeCompare(b.week));

    return c.json({ data: result });
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
