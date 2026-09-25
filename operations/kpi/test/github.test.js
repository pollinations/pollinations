import { afterEach, expect, it, vi } from "vitest";
import { kpiRoutes } from "../worker/kpi.ts";

afterEach(() => vi.unstubAllGlobals());

it.each([
    undefined,
    "test-only-github-token",
])("uses existing optional GitHub credentials (%s)", async (token) => {
    const upstream = vi
        .fn()
        .mockResolvedValue(Response.json({ stargazers_count: 12 }));
    vi.stubGlobal("fetch", upstream);
    const result = await kpiRoutes.request(
        "https://kpi.test/github",
        {},
        { GITHUB_TOKEN: token },
    );
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ stars: 12 });
    const headers = new Headers(upstream.mock.calls[0][1].headers);
    expect(headers.get("Authorization")).toBe(token ? `Bearer ${token}` : null);
});
