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
vi.mock("../frontend/src/api.ts", async () => {
    const { hc } = await import("hono/client");
    return {
        accountClient: hc<ApiRoutes>("https://gen.test", {
            fetch: async (input: RequestInfo | URL) => {
                const url = new URL(String(input));
                requests.push(url);
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
            { keys: ["key-a", "key-b"], models: [] },
            { api_key_ids: "key-a,key-b" },
        ],
        [month, { keys: [], models: ["flux"] }, { models: "flux" }],
        [
            month,
            { keys: ["key-a"], models: ["flux", "gpt-5"] },
            { api_key_ids: "key-a", models: "flux,gpt-5" },
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
    // Picks narrow the loaded rows; only a new period loads the table again.
    expect(
        requests.filter((url) => url.pathname === "/account/usage/daily"),
    ).toHaveLength(2);
});
