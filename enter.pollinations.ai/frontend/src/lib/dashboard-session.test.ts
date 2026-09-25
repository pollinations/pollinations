import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    createDashboardSessionResolver,
    type DashboardSessionResult,
} from "./dashboard-session.ts";

type TestUser = { id: string };

const OK = (user: TestUser): DashboardSessionResult<TestUser> => ({
    data: { user },
    error: null,
});

const UNAUTHENTICATED = (
    status: 401 | 403 = 401,
): DashboardSessionResult<TestUser> => ({
    data: null,
    error: { status },
});

const SERVER_ERROR = (): DashboardSessionResult<TestUser> => ({
    data: null,
    error: { status: 500 },
});

const STALE_TIME = 30_000;

describe("createDashboardSessionResolver", () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("returns the resolved user on a normal refresh", async () => {
        const getSession = vi.fn().mockResolvedValue(OK({ id: "u1" }));
        const resolver = createDashboardSessionResolver(
            getSession,
            STALE_TIME,
        );

        await expect(resolver.resolve()).resolves.toEqual({
            user: { id: "u1" },
        });
    });

    it(
        "regression: a transient refresh failure after a successful create " +
            "keeps the last known session instead of forcing sign-out",
        async () => {
            const getSession = vi
                .fn()
                // The initial dashboard load, well before the key was created.
                .mockResolvedValueOnce(OK({ id: "u1" }))
                // The refresh triggered right after creating a key. The
                // create-key call itself already succeeded and the caller
                // is holding the one-time secret; this get-session request
                // is the one that fails.
                .mockRejectedValueOnce(new Error("network error"));
            const resolver = createDashboardSessionResolver(
                getSession,
                STALE_TIME,
            );

            // Establish a confirmed session (mirrors loading the dashboard).
            await expect(resolver.resolve()).resolves.toEqual({
                user: { id: "u1" },
            });

            // Spend >30s in the create-key dialog so the session cache
            // expires, exactly like the reported reproduction.
            vi.advanceTimersByTime(STALE_TIME + 1);

            // Key creation succeeded; refreshKeys() invalidates the
            // dashboard route, re-running beforeLoad. The get-session
            // request behind it fails. This must not throw — throwing
            // here is what replaces the whole dashboard layout (and the
            // create-key dialog holding the secret) with the generic
            // error page.
            await expect(resolver.resolve()).resolves.toEqual({
                user: { id: "u1" },
            });
        },
    );

    it(
        "regression: a transient refresh failure with a non-auth error " +
            "status is also treated as transient, not a signed-out session",
        async () => {
            const getSession = vi
                .fn()
                .mockResolvedValueOnce(OK({ id: "u1" }))
                .mockResolvedValueOnce(SERVER_ERROR());
            const resolver = createDashboardSessionResolver(
                getSession,
                STALE_TIME,
            );

            await resolver.resolve();
            vi.advanceTimersByTime(STALE_TIME + 1);

            await expect(resolver.resolve()).resolves.toEqual({
                user: { id: "u1" },
            });
        },
    );

    it("does not swallow a transient failure on the very first load (no cached session to fall back to)", async () => {
        const getSession = vi.fn().mockRejectedValue(new Error("offline"));
        const resolver = createDashboardSessionResolver(
            getSession,
            STALE_TIME,
        );

        // This is not a blanket "always trust the cache" fallback: with
        // nothing yet confirmed, the failure must still surface.
        await expect(resolver.resolve()).rejects.toThrow();
    });

    it("expired/revoked session: a 401 throws and clears any cached session, even after a prior success", async () => {
        const getSession = vi
            .fn()
            .mockResolvedValueOnce(OK({ id: "u1" }))
            .mockResolvedValueOnce(UNAUTHENTICATED(401));
        const resolver = createDashboardSessionResolver(
            getSession,
            STALE_TIME,
        );

        await resolver.resolve();
        vi.advanceTimersByTime(STALE_TIME + 1);

        await expect(resolver.resolve()).rejects.toThrow(
            "Authentication failed.",
        );

        // The now-invalid session must not be handed out on a later
        // transient failure either — an expired session is not something
        // to "ride out".
        getSession.mockRejectedValueOnce(new Error("network error"));
        vi.advanceTimersByTime(STALE_TIME + 1);
        await expect(resolver.resolve()).rejects.toThrow();
    });

    it("expired/revoked session: a 403 is treated the same as a 401", async () => {
        const getSession = vi.fn().mockResolvedValue(UNAUTHENTICATED(403));
        const resolver = createDashboardSessionResolver(
            getSession,
            STALE_TIME,
        );

        await expect(resolver.resolve()).rejects.toThrow(
            "Authentication failed.",
        );
    });

    it("caches the in-flight session request within the stale window", async () => {
        const getSession = vi.fn().mockResolvedValue(OK({ id: "u1" }));
        const resolver = createDashboardSessionResolver(
            getSession,
            STALE_TIME,
        );

        await resolver.resolve();
        await resolver.resolve();
        vi.advanceTimersByTime(STALE_TIME - 1);
        await resolver.resolve();

        expect(getSession).toHaveBeenCalledTimes(1);

        vi.advanceTimersByTime(2);
        await resolver.resolve();
        expect(getSession).toHaveBeenCalledTimes(2);
    });
});
