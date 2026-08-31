import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SourceCell } from "./Provenance";

const LIVE_CLOUD_SOURCES = [
    ["bigquery", "BQ"],
    ["dashboard", "DSH"],
    ["reconcile", "REC"],
    ["correction", "COR"],
    ["grant", "GRT"],
    ["internal", "INT"],
] as const;

describe("SourceCell", () => {
    it.each(
        LIVE_CLOUD_SOURCES,
    )("renders the %s source as %s", (source, badge) => {
        const html = renderToStaticMarkup(<SourceCell sources={[source]} />);

        expect(html).toContain(`>${badge}<`);
    });

    it("surfaces source values outside the provenance contract without breaking the tab", () => {
        const html = renderToStaticMarkup(
            <SourceCell sources={["mystery-source"]} />,
        );

        expect(html).toContain("? mystery-source");
        expect(html).toContain("Unknown source");
    });
});
