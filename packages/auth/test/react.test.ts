import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import { dashboardFetch, signOut, useDashboardSession } from "../src/react";

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

it("uses the supplied auth namespace for the reviewer session and logout", async () => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const assign = vi.fn();
    vi.stubGlobal(
        "window",
        Object.assign(new EventTarget(), {
            setInterval,
            clearInterval,
            location: { assign },
        }),
    );
    const upstream = vi.fn().mockImplementation(async () =>
        Response.json({
            user: { sub: "reviewer", email: "reviewer@example.com" },
        }),
    );
    vi.stubGlobal("fetch", upstream);
    function Account() {
        useDashboardSession("/flow-reviewer/auth");
        return null;
    }
    let renderer!: ReactTestRenderer;
    try {
        await act(async () => {
            renderer = create(createElement(Account));
        });
        expect(upstream).toHaveBeenCalledWith(
            "/flow-reviewer/auth/session",
            expect.objectContaining({ credentials: "same-origin" }),
        );
        await signOut("/flow-reviewer/auth");
        expect(upstream).toHaveBeenLastCalledWith(
            "/flow-reviewer/auth/logout",
            expect.objectContaining({ method: "POST" }),
        );
        expect(assign).toHaveBeenCalledWith("/");
    } finally {
        if (renderer) await act(async () => renderer.unmount());
    }
});
