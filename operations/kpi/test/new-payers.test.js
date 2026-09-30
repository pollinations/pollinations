import { afterEach, expect, it, vi } from "vitest";
import { kpiRoutes } from "../worker/kpi.ts";

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

it.each([
    200, 404,
])("loads first-payer counts without hiding upstream errors (%s)", async (status) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-30T12:00:00Z"));
    const put = vi.fn();
    vi.stubGlobal("caches", {
        open: async () => ({ match: async () => undefined, put }),
    });
    const fetch = vi.fn(async () =>
        Response.json(
            { data: [{ week: "2026-09-21", new_payers: 42 }] },
            { status },
        ),
    );
    vi.stubGlobal("fetch", fetch);
    const result = await kpiRoutes.request(
        "https://kpi.test/new-payers?weeks_back=1",
        {},
        {
            TINYBIRD_INGEST_URL: "https://tinybird.test/v0/events",
            TINYBIRD_READ_TOKEN: "test-only-read-token",
        },
    );
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toContain(
        "weekly_new_stripe_payers.json?start_date=2026-09-21",
    );
    expect(result.status).toBe(status === 200 ? 200 : 503);
    expect((await result.json()).data).toEqual(
        status === 200
            ? [
                  { week: "2026-09-21", new_payers: 42 },
                  { week: "2026-09-28", new_payers: 0 },
              ]
            : [],
    );
    expect(put).toHaveBeenCalledTimes(status === 200 ? 1 : 0);
});
