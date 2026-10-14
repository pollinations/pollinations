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
        expect(html).toContain("polli:bg-surface-opaque");
        expect(html).toContain("polli:focus-visible:ring-theme-border");
    });

    test("a tint replaces the default fill and keeps the caller's style", () => {
        const html = renderToStaticMarkup(
            <LinkCard
                href="https://pollinations.ai"
                tint="var(--polli-color-modality-image-bg)"
                style={{ minHeight: 10 }}
            >
                Pollinations
            </LinkCard>,
        );

        expect(html).toContain(
            "--polli-card-tint:var(--polli-color-modality-image-bg)",
        );
        expect(html).toContain("min-height:10px");
        expect(html).toContain("polli:bg-(--polli-card-tint)");
        expect(html).not.toContain("polli:bg-surface-opaque/80");
    });
});
