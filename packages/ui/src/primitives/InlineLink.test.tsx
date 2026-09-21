import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, test, vi } from "vitest";
import { Markdown } from "../compositions/Markdown.tsx";
import { Prose } from "../compositions/Prose.tsx";
import { InlineLink } from "./InlineLink.tsx";

afterEach(() => vi.unstubAllGlobals());

describe("shared link destinations", () => {
    test.each([
        "/keys",
        "#details",
        "?page=2",
        "https://enter.pollinations.ai/keys",
        "mailto:billing@pollinations.ai",
        "tel:+123456789",
    ])("keeps %s in the current context", (href) => {
        vi.stubGlobal("location", { origin: "https://enter.pollinations.ai" });
        const html = renderToStaticMarkup(
            <InlineLink href={href}>Open</InlineLink>,
        );
        expect(html).not.toContain('target="_blank"');
        expect(html).not.toContain("<svg");
    });
    test.each([
        "https://example.com",
        "//example.com",
        "https://enter.pollinations.ai.example.com",
        "https://openwebui.pollinations.ai",
    ])("marks %s as external", (href) => {
        vi.stubGlobal("location", { origin: "https://enter.pollinations.ai" });
        const html = renderToStaticMarkup(
            <InlineLink href={href}>Open</InlineLink>,
        );
        expect(html).toContain('target="_blank"');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain("<svg");
    });
    test("respects an explicit internal destination without browser globals", () => {
        const html = renderToStaticMarkup(
            <InlineLink
                href="https://enter.pollinations.ai/keys"
                external={false}
            >
                Keys
            </InlineLink>,
        );
        expect(html).not.toContain('target="_blank"');
        expect(html).not.toContain("<svg");
    });
    test.each([
        Markdown,
        Prose,
    ])("uses the same behavior in Markdown", (Component) => {
        vi.stubGlobal("location", { origin: "https://enter.pollinations.ai" });
        const html = renderToStaticMarkup(
            <Component>
                {
                    "[Keys](https://enter.pollinations.ai/keys) [Docs](https://example.com) [Email](mailto:billing@pollinations.ai)"
                }
            </Component>,
        );
        expect(html.match(/target="_blank"/g)).toHaveLength(1);
        expect(html.match(/<svg/g)).toHaveLength(1);
        expect(html.match(/class="polli-link"/g)).toHaveLength(3);
    });
    test("supports async navigation without anchor attributes on a button", () => {
        const html = renderToStaticMarkup(
            <InlineLink as="button" type="button" external disabled>
                Opening billing…
            </InlineLink>,
        );
        expect(html).toContain("<button");
        expect(html).toContain('disabled=""');
        expect(html).toContain("<svg");
        expect(html).not.toContain("target=");
        expect(html).not.toContain("rel=");
    });
});
