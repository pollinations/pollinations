import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { StableLabel } from "./StableLabel.tsx";

describe("StableLabel", () => {
    test("reserves every option invisibly and shows the text once", () => {
        const html = renderToStaticMarkup(
            <StableLabel text="New" options={["New", "Popular"]} />,
        );

        // Both options size the grid cell, hidden from sight and from
        // assistive tech; only the current text is read.
        expect(html.match(/polli:invisible/g)).toHaveLength(2);
        expect(html.match(/aria-hidden="true"/g)).toHaveLength(2);
        expect(html).toContain("Popular");
        expect(html.endsWith(">New</span></span>")).toBe(true);
    });
});
