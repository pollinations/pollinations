import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { SegmentedControl } from "./SegmentedControl.tsx";

const options = [
    { value: "7d", label: "7d" },
    { value: "1h", label: "1h" },
] as const;

describe("SegmentedControl", () => {
    test("marks only the chosen value as pressed, inside a labelled group", () => {
        const html = renderToStaticMarkup(
            <SegmentedControl
                options={options}
                value="1h"
                onChange={() => {}}
                ariaLabel="Window"
            />,
        );

        expect(html).toContain('<fieldset aria-label="Window"');
        expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
        expect(html.indexOf('aria-pressed="true"')).toBeGreaterThan(
            html.indexOf(">7d<"),
        );
    });

    test("shows the choice by fill, never by a border or ring", () => {
        const html = renderToStaticMarkup(
            <SegmentedControl
                options={options}
                value="7d"
                onChange={() => {}}
                ariaLabel="Window"
            />,
        );

        expect(html).toContain("polli:bg-theme-bg-active");
        expect(html).not.toMatch(/polli:(border|ring)-theme/);
    });
});
