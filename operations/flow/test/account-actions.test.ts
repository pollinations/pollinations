import { describe, expect, it } from "vitest";
import {
    accountActionEdges,
    accountActionNodes,
    accountActionScreens,
} from "../flow-account-actions";
import { getFlowFocus } from "../flow-diagram";
import {
    galleryCardsForFlow,
    galleryScreensForFlow,
} from "../flow-gallery-data";

describe("independent account actions", () => {
    it("uses one page and state inventory in Screens, Map and Journey", () => {
        expect(galleryScreensForFlow("app", "topup")).toEqual(
            accountActionScreens,
        );
        expect(galleryCardsForFlow("app", "topup")).toEqual(
            accountActionScreens,
        );
        const map = getFlowFocus("app", "topup");
        expect(map.nodes).toEqual(accountActionNodes);
        expect(map.edges).toEqual(accountActionEdges);
        expect(new Set(map.nodes.map((node) => node.screen))).toEqual(
            new Set(accountActionScreens.map((screen) => screen.id)),
        );
    });
    it("gives every page an exit and every transition an existing destination", () => {
        for (const screen of accountActionScreens)
            expect(
                accountActionEdges.some((edge) => edge.from === screen.id),
            ).toBe(true);
        for (const edge of accountActionEdges)
            for (const id of [edge.from, edge.to])
                expect(
                    accountActionScreens.some((screen) => screen.id === id),
                ).toBe(true);
    });
    it("keeps all key and payment failure states on their actual owner routes", () => {
        const key = accountActionScreens.find(
            (screen) => screen.id === "account-key",
        );
        const wallet = accountActionScreens.find(
            (screen) => screen.id === "account-wallet",
        );
        if (!key || !wallet) throw new Error("Missing account action screens");
        expect(
            key.variants?.map((variant) => variant.params?.account_case),
        ).toEqual(
            expect.arrayContaining([
                "missing",
                "load-error",
                "save-error",
                "saving",
            ]),
        );
        expect(
            wallet.variants?.map((variant) => variant.params?.account_case),
        ).toEqual(
            expect.arrayContaining([
                "checkout-return",
                "canceled",
                "billing-error",
                "load-error",
            ]),
        );
        for (const screen of [key, wallet])
            expect(
                screen.variants?.some((variant) =>
                    variant.screen?.endsWith("signed-out"),
                ),
            ).toBe(true);
    });
});
