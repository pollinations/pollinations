import { afterEach, expect, it, vi } from "vitest";
import { createDashboardClient } from "../src/index";

afterEach(() => vi.unstubAllGlobals());

it("sends dashboard reads to Enter with its existing cookie, not a bearer key", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    await createDashboardClient().fetch("/kpi/usage?weeks_back=12");
    expect(String(fetch.mock.calls[0][0])).toBe(
        "https://enter.pollinations.ai/api/dashboards/kpi/usage?weeks_back=12",
    );
    expect(fetch.mock.calls[0][1]).toEqual({ credentials: "include" });
});

it("supports a local Enter instance", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ data: [] }));
    vi.stubGlobal("fetch", fetch);
    await createDashboardClient("http://localhost:3000").fetch(
        "/economics/pipes/economics_bank_ledger_api",
    );
    expect(String(fetch.mock.calls[0][0])).toBe(
        "http://localhost:3000/api/dashboards/economics/pipes/economics_bank_ledger_api",
    );
});
