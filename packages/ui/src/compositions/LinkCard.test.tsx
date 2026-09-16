import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { LinkCard } from "./LinkCard.tsx";

describe("LinkCard", () => {
    test("renders the link and card surface as one element", () => {
        const html = renderToStaticMarkup(
            <LinkCard href="https://pollinations.ai">Pollinations</LinkCard>,
        );

        expect(html.startsWith("<a ")).toBe(true);
        expect(html).not.toContain("<div");
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain("polli:shadow-well");
        expect(html).toContain("polli:focus-visible:ring-theme-border");
    });
});
