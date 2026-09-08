import { afterEach, expect, it, vi } from "vitest";
import { dashboardFetch } from "../src/react";

afterEach(() => vi.unstubAllGlobals());

it("notifies the shared login UI when a private read loses its session", async () => {
    const events = new EventTarget();
    const expired = vi.fn();
    events.addEventListener("pollinations:session-expired", expired);
    vi.stubGlobal("window", events);
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 401 })),
    );
    await expect(dashboardFetch("/api/kpi/stats")).rejects.toThrow(
        "sign in again",
    );
    expect(expired).toHaveBeenCalledOnce();
});

it("preserves data-source errors without signing the user out", async () => {
    const events = new EventTarget();
    const expired = vi.fn();
    events.addEventListener("pollinations:session-expired", expired);
    vi.stubGlobal("window", events);
    vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(new Response(null, { status: 503 })),
    );
    expect((await dashboardFetch("/api/kpi/stats")).status).toBe(503);
    expect(expired).not.toHaveBeenCalled();
});
