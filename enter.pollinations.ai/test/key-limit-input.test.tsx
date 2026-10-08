import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { KeyLimitInput } from "../frontend/src/components/keys/key-limit-input.tsx";

describe("key budget form constraints", () => {
    it.each([
        4.9987342, 0.005, -0.0003,
    ])("preserves %s without a step or minimum that blocks submission", (balance) => {
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
    });

    it("keeps an unlimited budget empty and prevents new negative budgets", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput kind="budget" value={null} onChange={() => {}} />,
        );
        expect(html).toContain('value=""');
        expect(html).toContain('placeholder="Unlimited"');
        expect(html).toContain('min="0"');
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

describe("inline limit layout", () => {
    it("keeps the named input and label association in inline mode", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput
                kind="budget"
                value={5}
                onChange={() => {}}
                inline
            />,
        );
        // Form serialization still sees exactly one named input.
        expect(html.match(/\bname="pollen-budget"/g)).toHaveLength(1);
        const id = html.match(/<label for="([^"]+)"/)?.[1];
        expect(id).toBeTruthy();
        expect(html).toContain(`id="${id}"`);
        expect(html).toContain('value="5"');
    });

    it("keeps the same constraints and empty-value behavior inline", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput
                kind="expiry"
                value={null}
                onChange={() => {}}
                inline
            />,
        );
        expect(html).toContain('name="expiry-days"');
        expect(html).toContain('value=""');
        expect(html).toContain('placeholder="Never"');
        expect(Number(html.match(/\bmin="([^"]+)"/)?.[1])).toBeGreaterThan(0);
    });

    it("preserves a spent negative budget minimum inline", () => {
        const html = renderToStaticMarkup(
            <KeyLimitInput
                kind="budget"
                value={-0.0003}
                onChange={() => {}}
                inline
            />,
        );
        expect(html).toContain('value="-0.0003"');
        const minimum = html.match(/\bmin="([^"]+)"/);
        expect(Number(minimum?.[1])).toBeLessThanOrEqual(-0.0003);
    });
});
