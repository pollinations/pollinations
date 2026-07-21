import { describe, expect, it } from "vitest";
import { balanceLabel } from "./Balance.tsx";

describe("balanceLabel", () => {
    it("distinguishes an app allowance from the account wallet", () => {
        expect(balanceLabel({ balance: 2.5, scope: "key_budget" })).toBe(
            "2.5 pollen · app allowance",
        );
        expect(balanceLabel({ balance: 5, scope: "account" })).toBe(
            "5 pollen · wallet",
        );
    });
});
