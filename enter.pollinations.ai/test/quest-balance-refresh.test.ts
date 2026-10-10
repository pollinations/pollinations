import { describe, expect, it, vi } from "vitest";
import {
    DASHBOARD_ROUTE_ID,
    refreshDashboardBalanceAfterClaim,
} from "../frontend/src/components/quests/quest-balance-refresh.ts";

function fakeRouter({
    balance = Promise.resolve({ tier: 13 }),
    invalidateResult = Promise.resolve(),
} = {}) {
    const invalidate = vi.fn().mockResolvedValue(invalidateResult);
    const router = {
        invalidate,
        state: {
            matches: [
                { routeId: "/_dashboard/quests", loaderData: {} },
                { routeId: DASHBOARD_ROUTE_ID, loaderData: { balance } },
            ],
        },
    };
    return { router, invalidate, balance };
}

describe("refreshDashboardBalanceAfterClaim", () => {
    it("invalidates only the dashboard route, synchronously", async () => {
        const { router, invalidate } = fakeRouter();

        await refreshDashboardBalanceAfterClaim(router as never);

        expect(invalidate).toHaveBeenCalledTimes(1);
        const call = invalidate.mock.calls[0][0];
        expect(call.sync).toBe(true);
        expect(call.filter({ routeId: DASHBOARD_ROUTE_ID })).toBe(true);
        expect(call.filter({ routeId: "/_dashboard/quests" })).toBe(false);
    });

    it("resolves only after the refreshed balance promise settles", async () => {
        let balanceSettled = false;
        const balance = new Promise((resolve) =>
            setTimeout(() => {
                balanceSettled = true;
                resolve({ tier: 13 });
            }, 10),
        );
        const { router } = fakeRouter({ balance });

        let refreshSettled = false;
        const refresh = refreshDashboardBalanceAfterClaim(router as never).then(
            () => {
                refreshSettled = true;
            },
        );

        expect(refreshSettled).toBe(false);
        await refresh;
        expect(balanceSettled).toBe(true);
        expect(refreshSettled).toBe(true);
    });

    it("does not swallow a balance that rejects", async () => {
        const { router } = fakeRouter({
            balance: Promise.reject(new Error("balance load failed")),
        });

        await expect(
            refreshDashboardBalanceAfterClaim(router as never),
        ).rejects.toThrow("balance load failed");
    });
});
