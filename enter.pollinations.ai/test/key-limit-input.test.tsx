import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyLimitInput } from "../frontend/src/components/keys/key-limit-input.tsx";

import { LimitsBadge } from "../frontend/src/components/keys/limits-badge.tsx";

it.each([
    [0.0027, "$0.0027"],
    [0.000001, "$0.000001"],
    [0, "$0.00"],
    [-0.01, "$0.00"],
    [null, "Unlimited"],
] as const)("shows the remaining key budget %s as %s", (budget, expected) => {
    const html = renderToStaticMarkup(
        <LimitsBadge expiresAt={null} pollenBudget={budget} />,
    );
    expect(html).toContain("Budget left");
    expect(html).toContain(`>${expected}<`);
});

describe("key budget form constraints", () => {
    it.each([4.9987342, 0.005, -0.0003])(
        "preserves %s without a step or minimum that blocks submission",
        (balance) => {
            const html = renderToStaticMarkup(
                <form>
                    <KeyLimitInput
                        kind="budget"
                        value={balance}
                        onChange={() => {}}
                    />
                    <button type="submit">Save</button>
                </form>,
            );
            expect(html).toContain(`value="${balance}"`);
            expect(html).toContain('step="any"');
            const minimum = html.match(/\bmin="([^"]+)"/);
            expect(minimum).not.toBeNull();
            expect(Number(minimum?.[1])).toBeLessThanOrEqual(balance);
        },
    );

    it("keeps an unlimited budget empty and prevents new negative budgets", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput kind="budget" value={null} onChange={() => {}} />,
        );
        expect(html).toContain('value=""');
        expect(html).toContain('placeholder="Unlimited"');
        expect(html).toContain('min="0"');
    });

    it("allows an unchanged expired key to be saved", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput kind="expiry" value={0} onChange={() => {}} />,
        );
        expect(html).toContain('min="0"');
        expect(html).toContain('value="0"');
    });

    it("keeps the expiry minimum positive", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput kind="expiry" value={null} onChange={() => {}} />,
        );
        expect(html).toContain('value=""');
        expect(html).toContain('placeholder="Never"');
        expect(Number(html.match(/\bmin="([^"]+)"/)?.[1])).toBeGreaterThan(0);
    });
});
