import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { TrendsTab } from "./TrendsTab";

afterEach(() => vi.useRealTimers());
it("renders charts and unknown values without repeating the reconciliation messages", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-14T12:00:00Z"));
    const html = renderToStaticMarkup(
        createElement(TrendsTab, {
            data: {},
            year: "2026",
        }),
    );
    expect(html).not.toContain("Stripe sales missing");
    expect(html).not.toContain("API costs missing");
    expect(html).toContain("September*");
    expect(html).toContain("gaps mean missing data");
    expect(html).toContain('aria-label="Cost scope"');
    expect(html).toContain("Whole company");
    expect(html.match(/<svg[^>]+aria-label=/g)).toHaveLength(4);
    expect(html).toContain("Monthly details");
    expect(html).not.toContain("NaN");
    expect(html).toContain("January*");
    expect(html).not.toContain("2025");
    expect(html).not.toContain("month filter");
    expect(html).toContain('<option value="2026" selected="">2026</option>');
    expect(
        /<button[^>]*aria-pressed="true"[^>]*>Full year<\/button>/.test(html),
    ).toBe(true);
    expect(html).toContain("Expenses before credits");
    expect(html).toContain("Infrastructure");
    expect(html).toContain("Other operations");
});
