import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FilterMultiSelect, MonthFilter, YearFilter } from "./Filters";

const months = ["2026-06", "2026-07", "2026-08"];

describe("MonthFilter", () => {
    it("shows only months from the selected year without repeating the year", () => {
        const html = renderToStaticMarkup(
            <MonthFilter
                months={[...months, "2027-01"]}
                year="2026"
                value="2026-07"
                onChange={() => {}}
            />,
        );

        expect(html).not.toContain("YTD");
        expect(html).toContain("July");
        expect(html).not.toContain("July 26");
        expect(html).not.toContain("January");
    });
});

describe("YearFilter", () => {
    it("uses a separate larger tab row even when only one year exists", () => {
        const html = renderToStaticMarkup(
            <YearFilter years={["2026"]} value="2026" onChange={() => {}} />,
        );

        expect(html).toContain('aria-label="year filter"');
        expect(html).toContain(">2026<");
    });
});

describe("FilterMultiSelect", () => {
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
