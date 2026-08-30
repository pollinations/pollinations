import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { ExternalLinkButton } from "../compositions/ExternalLinkButton.tsx";
import { Button } from "./Button.tsx";

describe("Button appearances", () => {
    test("keeps the pill appearance by default", () => {
        const html = renderToStaticMarkup(<Button>Default</Button>);

        expect(html).toContain("polli:rounded-full");
        expect(html).not.toContain("polli:border-r-[3px]");
    });

    test("applies the raised appearance to external CTAs", () => {
        const html = renderToStaticMarkup(
            <ExternalLinkButton href="https://example.com" appearance="raised">
                Open
            </ExternalLinkButton>,
        );

        expect(html).toContain("polli:rounded-xl");
        expect(html).toContain("polli:border-r-[3px]");
        expect(html).toContain('target="_blank"');
    });
});
