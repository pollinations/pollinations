import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterMultiSelect, MonthFilter } from "./Filters";

const months = ["2026-06", "2026-07", "2026-08"];
const now = new Date("2026-08-22T00:00:00Z");

describe("MonthFilter", () => {
    it("hides YTD in month-only views", () => {
        const html = renderToStaticMarkup(
            <MonthFilter
                months={months}
                mode="month"
                now={now}
                value={["2026-07"]}
                onChange={() => {}}
            />,
        );

        expect(html).not.toContain("YTD");
        expect(html).toContain("July 26");
    });

    it("offers completed-month YTD in aggregate views", () => {
        const html = renderToStaticMarkup(
            <MonthFilter
                months={months}
                mode="month-or-ytd"
                now={now}
                value={["2026-06", "2026-07"]}
                onChange={() => {}}
            />,
        );

        expect(html).toContain("YTD");
        expect(html).not.toContain(">2026<");
    });

    it("uses the dropdown value instead of a visible label", () => {
        const allHtml = renderToStaticMarkup(
            <FilterMultiSelect
                options={[{ value: "aws", label: "aws", count: 3 }]}
                placeholder="All providers"
                value={[]}
                onChange={() => {}}
            />,
        );
        const selectedHtml = renderToStaticMarkup(
            <FilterMultiSelect
                options={[{ value: "aws", label: "aws", count: 3 }]}
                placeholder="All providers"
                value={["aws"]}
                onChange={() => {}}
            />,
        );

        expect(allHtml).toContain("All providers");
        expect(selectedHtml).toContain("aws · 3");
    });
});
