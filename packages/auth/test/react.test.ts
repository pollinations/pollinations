import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, expect, it, vi } from "vitest";
import {
    createDashboardActions,
    type DashboardAuthRuntime,
    dashboardFetch,
    signIn,
    signOut,
    useDashboardSession,
} from "../src/react";

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
        location: new URL("https://kpi.pollinations.ai/"),
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

it.each([
    ["", true],
    ["?signed_out=1", false],
    ["?auth_error=admin_required", false],
    ["?auth_error=invalid_state", false],
    ["?auth_error=unavailable", false],
])("starts sign-in only on a fresh signed-out arrival (%s)", async (search, redirects) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const assign = vi.fn();
    const events = Object.assign(new EventTarget(), {
        setInterval,
        clearInterval,
        location: {
            origin: "https://kpi.pollinations.ai",
            href: `https://kpi.pollinations.ai/weekly${search}`,
            search,
            assign,
        },
    });
    vi.stubGlobal("window", events);
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => Response.json({ user: null }, { status: 401 })),
    );
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
        expect(assign).toHaveBeenCalledTimes(redirects ? 1 : 0);
        if (redirects) {
            const url = new URL(assign.mock.calls[0][0]);
            expect(url.pathname).toBe("/auth/login");
            expect(url.searchParams.get("return_to")).toBe("/weekly");
        } else
            expect(session).toMatchObject({
                user: null,
                isPending: false,
                error: null,
            });
        await act(async () => {
            events.dispatchEvent(new Event("focus"));
        });
        expect(assign).toHaveBeenCalledTimes(redirects ? 1 : 0);
    } finally {
        if (renderer) await act(async () => renderer.unmount());
    }
});

it("clears return-state markers when explicitly retrying sign-in", () => {
    const assign = vi.fn();
    vi.stubGlobal("window", {
        location: {
            origin: "https://kpi.pollinations.ai",
            href: "https://kpi.pollinations.ai/weekly?x=1&signed_out=1&auth_error=admin_required",
            assign,
        },
    });
    signIn();
    expect(new URL(assign.mock.calls[0][0]).searchParams.get("return_to")).toBe(
        "/weekly?x=1",
    );
});

it("keeps an explicit sign-out on the signed-out return screen", async () => {
    const assign = vi.fn();
    vi.stubGlobal("window", { location: { assign } });
    vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(null, { status: 204 })),
    );
    await signOut();
    expect(assign).toHaveBeenCalledWith("/?signed_out=1");
});

it.each([
    ["", true],
    ["?signed_out=1", false],
    ["?auth_error=admin_required", false],
])("uses the injected backend and location for session arrivals (%s)", async (search, redirects) => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
    const assign = vi.fn();
    const events = Object.assign(new EventTarget(), {
        setInterval,
        clearInterval,
        location: {
            href: "https://enter.pollinations.ai/preview?signed_out=1",
            assign,
        },
    });
    vi.stubGlobal("window", events);
    const browserFetch = vi.fn();
    vi.stubGlobal("fetch", browserFetch);
    const upstream = vi.fn(async () =>
        Response.json({ user: null }, { status: 401 }),
    );
    const navigate = vi.fn();
    const runtime: DashboardAuthRuntime = {
        fetch: upstream,
        location: () => new URL(`https://kpi.pollinations.ai/weekly${search}`),
        navigate,
    };
    let session!: ReturnType<typeof useDashboardSession>;
    function Dashboard() {
        session = useDashboardSession(runtime);
        return null;
    }
    let renderer!: ReactTestRenderer;
    try {
        await act(async () => {
            renderer = create(createElement(Dashboard));
        });
        expect(upstream).toHaveBeenCalledWith("/auth/session", {
            credentials: "same-origin",
            signal: expect.any(AbortSignal),
        });
        expect(navigate).toHaveBeenCalledTimes(redirects ? 1 : 0);
        if (redirects)
            expect(navigate).toHaveBeenCalledWith(
                "https://kpi.pollinations.ai/auth/login?return_to=%2Fweekly",
            );
        else
            expect(session).toEqual({
                user: null,
                isPending: false,
                error: null,
            });

        const user = { sub: "admin-1", email: "admin@example.com" };
        upstream.mockResolvedValueOnce(Response.json({ user }));
        await act(async () => {
            events.dispatchEvent(new Event("focus"));
        });
        expect(session).toEqual({ user, isPending: false, error: null });
        expect(navigate).toHaveBeenCalledTimes(redirects ? 1 : 0);
        await act(async () => {
            events.dispatchEvent(new Event("pollinations:session-expired"));
        });
        expect(session.user).toBeNull();
        expect(browserFetch).not.toHaveBeenCalled();
        expect(assign).not.toHaveBeenCalled();
    } finally {
        if (renderer) await act(async () => renderer.unmount());
    }
});

it("routes sign-in and sign-out through the injected runtime", async () => {
    const destination = new URL(
        "https://economics.pollinations.ai/monthly?month=2026-09&signed_out=1&auth_error=admin_required",
    );
    const initialLocation = destination.href;
    const upstream = vi.fn(async () => new Response(null, { status: 204 }));
    const navigate = vi.fn();
    const actions = createDashboardActions({
        fetch: upstream,
        location: () => destination,
        navigate,
    });
    actions.signIn();
    const login = new URL(navigate.mock.calls[0][0]);
    expect(login.origin).toBe(destination.origin);
    expect(login.pathname).toBe("/auth/login");
    expect(login.searchParams.get("return_to")).toBe("/monthly?month=2026-09");
    expect(destination.href).toBe(initialLocation);

    await actions.signOut();
    expect(upstream).toHaveBeenCalledWith("/auth/logout", {
        method: "POST",
        credentials: "same-origin",
    });
    expect(navigate).toHaveBeenLastCalledWith("/?signed_out=1");
});

it("keeps the injected location when logout fails", async () => {
    const navigate = vi.fn();
    const actions = createDashboardActions({
        fetch: async () => new Response(null, { status: 503 }),
        location: () => new URL("https://kpi.pollinations.ai/weekly"),
        navigate,
    });
    await expect(actions.signOut()).rejects.toThrow("Could not sign out");
    expect(navigate).not.toHaveBeenCalled();
});
