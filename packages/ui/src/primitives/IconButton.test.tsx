import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { IconButton } from "./IconButton.tsx";

describe("IconButton", () => {
    test("forwards native button state and accessibility attributes", () => {
        const html = renderToStaticMarkup(
            <IconButton
                aria-label="Open options"
                aria-controls="options-menu"
                aria-expanded={false}
                disabled
            >
                <span aria-hidden="true">+</span>
            </IconButton>,
        );

        expect(html).toContain('type="button"');
        expect(html).toContain("disabled");
        expect(html).toContain('aria-label="Open options"');
        expect(html).toContain('aria-controls="options-menu"');
        expect(html).toContain('aria-expanded="false"');
        expect(html).toContain("polli:cursor-not-allowed");
        expect(html).not.toContain("polli:hover:bg-theme-bg-hover");
    });
});
