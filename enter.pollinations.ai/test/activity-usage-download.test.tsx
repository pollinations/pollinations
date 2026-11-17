import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import type { ApiRoutes } from "../frontend/src/backend-types.ts";
import type { ActivityPeriod } from "../frontend/src/components/activity/activity-period";
import {
    ACTIVITY_SOURCES,
    type Picks,
    useActivityData,
} from "../frontend/src/components/activity/use-activity-data";

const requests = vi.hoisted(() => [] as URL[]);
const earnings = vi.hoisted(() =>
    (
        [
            ["byop_markup", "app-a", "App A"],
            ["community_model", "model-m", "Model M"],
        ] as const
    ).map(([source, entity_id, entity_name]) => ({
        date: "2026-10-05",
        source,
        entity_id,
        entity_name,
        requests: 1,
        paid_requests: 1,
        tier_requests: 0,
        baseline_price: 0,
        pollen_earned: 1,
        paid_earned: 1,
        tier_earned: 0,
        cost_usd: 0,
        reward_rate: 0,
    })),
);
vi.mock("../frontend/src/api.ts", async () => {
    const { hc } = await import("hono/client");
    return {
        accountClient: hc<ApiRoutes>("https://gen.test", {
            fetch: async (input: RequestInfo | URL) => {
                const url = new URL(String(input));
                requests.push(url);
                if (url.pathname === "/account/earnings")
                    return Response.json({ daily: earnings });
                return url.pathname.endsWith("/daily")
                    ? Response.json({ usage: [] })
                    : new Response("timestamp\r\n");
            },
        }).account,
    };
});
vi.mock(
    "../frontend/src/components/activity/activity-csv",
    async (importOriginal) => ({
        ...(await importOriginal<object>()),
        saveBlob: vi.fn(),
    }),
);
afterEach(() => {
    requests.length = 0;
    vi.unstubAllGlobals();
});

it("downloads only the earnings rows the picks show", async () => {
    // The earnings CSV is built in the browser; capture the saved Blob.
    const saved: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
        saved.push(blob as Blob);
        return "blob:csv";
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    vi.stubGlobal("document", {
        createElement: () => ({ click() {}, remove() {} }),
        body: { appendChild() {} },
    });
    const query = {
        granularity: "month",
        period: "2026-10",
        timezone: "UTC",
    } as const;
    const { download } = await ACTIVITY_SOURCES.earnings.load(
        query,
        new AbortController().signal,
    );
    async function exportCsv(picks: Picks) {
        await download?.(picks);
        return saved.at(-1)?.text();
    }

    const all = await exportCsv({ keys: [], models: [] });
    expect(all).toContain("app-a");
    expect(all).toContain("model-m");
    const app = await exportCsv({ keys: ["app-a"], models: [] });
    expect(app).toContain("app-a");
    expect(app).not.toContain("model-m");
    const either = await exportCsv({ keys: ["app-a"], models: ["model-m"] });
    expect(either).toContain("app-a");
    expect(either).toContain("model-m");
});

it("downloads the usage CSV for the period and picks the chart shows", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const load = vi.spyOn(ACTIVITY_SOURCES.usage, "load");
    let download: (() => Promise<void>) | undefined;
    function Usage(view: { period: ActivityPeriod; picks: Picks }) {
        ({ download } = useActivityData({
            tab: "usage",
            metric: "pollen",
            group: "model",
            ...view,
        }));
        return null;
    }
    let renderer: ReactTestRenderer | undefined;
    // Shows the view, downloads its CSV and returns both queries.
    async function exportCsv(period: ActivityPeriod, picks: Picks) {
        await act(async () => {
            const view = <Usage period={period} picks={picks} />;
            if (renderer) renderer.update(view);
            else renderer = create(view);
        });
        // A new period loads the table first; picks reuse the loaded rows.
        await act(async () => {
            await load.mock.results.at(-1)?.value;
        });
        await download?.();
        const table = requests.findLast(
            (url) => url.pathname === "/account/usage/daily",
        );
        const csv = requests.at(-1);
        expect(csv?.pathname).toBe("/account/usage");
        return {
            table: Object.fromEntries(table?.searchParams ?? []),
            csv: Object.fromEntries(csv?.searchParams ?? []),
        };
    }

    const month = { granularity: "month", period: "2026-10" } as const;
    const day = { granularity: "day", period: "2026-10-05" } as const;
    const cases: [ActivityPeriod, Picks, Record<string, string>][] = [
        [month, { keys: [], models: [] }, {}],
        [
            month,
            { keys: ["key-a", "key-b"], models: ["flux", "gpt-5"] },
            { api_key_ids: "key-a,key-b", models: "flux,gpt-5" },
        ],
        [day, { keys: ["key-a"], models: [] }, { api_key_ids: "key-a" }],
    ];
    for (const [period, picks, filters] of cases) {
        const { table, csv } = await exportCsv(period, picks);
        expect(table).toMatchObject(period);
        expect(csv).toEqual({
            ...table,
            format: "csv",
            limit: "50000",
            ...filters,
        });
    }
});
