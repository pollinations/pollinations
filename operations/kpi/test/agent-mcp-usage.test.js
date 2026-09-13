import { afterEach, expect, it, vi } from "vitest";
import { kpiRoutes } from "../worker/kpi.ts";

afterEach(() => vi.unstubAllGlobals());

it.each([
    200, 404,
])("handles agent/MCP pipe status %s without inventing zeros", async (status) => {
    vi.stubGlobal("caches", {
        open: async () => ({
            match: async () => undefined,
            put: async () => {},
        }),
    });
    const row = {
        week: "2026-09-07",
        agent_requests: 2300,
        agent_users: 150,
        mcp_calls: 410,
        mcp_users: 12,
    };
    const upstream = vi.fn(async () =>
        Response.json({ data: [row] }, { status }),
    );
    vi.stubGlobal("fetch", upstream);
    const result = await kpiRoutes.request(
        "https://kpi.test/agent-mcp-usage?weeks_back=0",
        {},
        {
            TINYBIRD_INGEST_URL: "https://tinybird.test/v0/events",
            TINYBIRD_READ_TOKEN: "test-only-read-token",
        },
    );
    expect(upstream).toHaveBeenCalledTimes(1);
    expect(upstream.mock.calls[0][0]).toContain(
        "/v0/pipes/weekly_agent_mcp_usage.json?start_date=",
    );
    expect(result.status).toBe(status === 200 ? 200 : 503);
    expect((await result.json()).data).toEqual(status === 200 ? [row] : []);
});
