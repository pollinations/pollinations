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

    test("renders a focusable link when given an href", () => {
        const html = renderToStaticMarkup(
            <IconButton
                href="https://github.com/pollinations/pollinations"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="GitHub"
                variant="ghost"
                size="md"
            >
                <span aria-hidden="true">G</span>
            </IconButton>,
        );

        expect(html.startsWith("<a ")).toBe(true);
        expect(html).toContain(
            'href="https://github.com/pollinations/pollinations"',
        );
        expect(html).toContain('aria-label="GitHub"');
        expect(html).toContain("polli-control");
        expect(html).not.toContain('type="button"');
    });
});
