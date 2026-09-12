import { describe, expect, test } from "vitest";
import { planKeyTopUp } from "./top-up-key-demo";

describe("key top-up routing", () => {
    test("uses existing balance without a purchase", () => {
        expect(planKeyTopUp(50, 5, 20)).toEqual({
            nextAllowance: 25,
            shortfall: 0,
            purchaseAmount: 0,
        });
    });
    test("does not offer Stripe when balance exactly covers the allowance", () => {
        expect(planKeyTopUp(25, 5, 20).purchaseAmount).toBe(0);
    });
    test("includes the current allowance when checking available balance", () => {
        expect(planKeyTopUp(20, 5, 20)).toEqual({
            nextAllowance: 25,
            shortfall: 5,
            purchaseAmount: 10,
        });
    });
    test("offers the smallest sufficient pack for an empty account", () => {
        expect(planKeyTopUp(0, 0, 20)).toEqual({
            nextAllowance: 20,
            shortfall: 20,
            purchaseAmount: 20,
        });
    });
    test("does not suggest an insufficient pack", () => {
        expect(planKeyTopUp(0, 50, 100).purchaseAmount).toBeNull();
    });
});
