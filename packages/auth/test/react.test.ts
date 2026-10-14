import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardFetch, useDashboardSession } from "../src/react";

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

it("keeps the open dashboard through a failed poll and only clears a confirmed invalid session", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    vi.useFakeTimers();
    const events = Object.assign(new EventTarget(), {
        setInterval,
        clearInterval,
    });
    vi.stubGlobal("window", events);
    const user = { sub: "user-1", email: "alice@example.com" };
    const upstream = vi.fn().mockResolvedValueOnce(Response.json({ user }));
    vi.stubGlobal("fetch", upstream);
    let session!: ReturnType<typeof useDashboardSession>;
    function Dashboard() {
        session = useDashboardSession();
        return null;
    }
    let renderer!: ReactTestRenderer;
    try {
        await act(async () => {
            renderer = create(createElement(Dashboard));
        });
        expect(session).toMatchObject({ user, isPending: false, error: null });
        upstream.mockRejectedValueOnce(new Error("network offline"));
        await act(async () => {
            await vi.advanceTimersByTimeAsync(60_000);
        });
        expect(session).toMatchObject({ user, isPending: false, error: null });
        upstream.mockResolvedValueOnce(new Response(null, { status: 503 }));
        await act(async () => {
            events.dispatchEvent(new Event("focus"));
        });
        expect(session).toMatchObject({ user, isPending: false, error: null });
        upstream.mockResolvedValueOnce(
            Response.json({ user: null }, { status: 401 }),
        );
        await act(async () => {
            events.dispatchEvent(new Event("focus"));
        });
        expect(session).toMatchObject({
            user: null,
            isPending: false,
            error: null,
        });
    } finally {
        if (renderer) await act(async () => renderer.unmount());
        vi.useRealTimers();
    }
});
