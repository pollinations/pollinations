import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PollenModelNotice } from "./PollenModelNotice.tsx";

const renderNotice = (
    paidBalance: number | null | undefined,
    requirement: "all" | "some" | null = "all",
) =>
    renderToStaticMarkup(
        <PollenModelNotice
            requirement={requirement}
            paidBalance={paidBalance}
            enterUrl="https://enter.pollinations.ai"
        />,
    );

describe("paid model notice", () => {
    it("requires confirmed empty Paid balance and a paid-model requirement", () => {
        for (const balance of [undefined, null, Number.NaN, Infinity, 5]) {
            expect(renderNotice(balance)).toBe("");
        }
        expect(renderNotice(0, null)).toBe("");
    });

    it("links to top-up only for an all-paid selection", () => {
        expect(renderNotice(0)).toContain("Paid required");
        expect(renderNotice(0)).toContain(
            'href="https://enter.pollinations.ai/top-up"',
        );
        expect(renderNotice(0, "some")).toBe("");
        expect(renderNotice(-1)).toContain("Paid required");
    });
});
