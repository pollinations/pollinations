import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ToolCallDetails } from "./ToolCallDetails.tsx";

describe("ToolCallDetails", () => {
    it("renders structured input and safe links", () => {
        const html = renderToStaticMarkup(
            <ToolCallDetails
                name="SEARCH_WEB"
                input={{ query: "pollinations" }}
                output="Open https://example.test/result"
                defaultOpen
            />,
        );

        expect(html).toContain("Completed");
        expect(html).toContain("SEARCH_WEB");
        expect(html).toContain("Parameters");
        expect(html).toContain("Result");
        expect(html).toContain("&quot;query&quot;: &quot;pollinations&quot;");
        expect(html).toContain('href="https://example.test/result"');
    });

    it.each([
        [
            "Saved to https://example.test/a.png.",
            "https://example.test/a.png",
            ".",
        ],
        ["See (https://example.test/a)", "https://example.test/a", ")"],
        [
            "[image](https://example.test/a.png)",
            "https://example.test/a.png",
            ")",
        ],
        [
            "Open https://example.test/a, then continue",
            "https://example.test/a",
            ",",
        ],
        ["See https://example.test/a).", "https://example.test/a", ")."],
        [
            "See (https://en.wikipedia.org/wiki/Pollen_(biology)).",
            "https://en.wikipedia.org/wiki/Pollen_(biology)",
            ").",
        ],
    ])("keeps prose punctuation outside links in %s", (output, href, suffix) => {
        const html = renderToStaticMarkup(
            <ToolCallDetails name="SEARCH_WEB" output={output} defaultOpen />,
        );

        expect(html).toContain(`href="${href}"`);
        expect(html).toContain(`</a>${suffix}`);
    });

    it.each([
        ["https://example.test/result", "https://example.test/result"],
        [{ url: "https://example.test/a.png" }, "https://example.test/a.png"],
        [
            { url: "https://example.test/search?q=what?" },
            "https://example.test/search?q=what?",
        ],
        [{ url: "https://example.test/file." }, "https://example.test/file."],
        ['"https://example.test/file."', "https://example.test/file."],
        [
            "https://en.wikipedia.org/wiki/Pollen_(biology)",
            "https://en.wikipedia.org/wiki/Pollen_(biology)",
        ],
        ["https://example.test/a_(b_(c))", "https://example.test/a_(b_(c))"],
        [
            "https://example.test/a.b?q=one,two&next=(page)#part:three",
            "https://example.test/a.b?q=one,two&amp;next=(page)#part:three",
        ],
    ])("preserves URL content in %s", (output, href) => {
        const html = renderToStaticMarkup(
            <ToolCallDetails name="SEARCH_WEB" output={output} defaultOpen />,
        );

        expect(html).toContain(`href="${href}"`);
    });

    it("escapes tool output and labels failures", () => {
        const html = renderToStaticMarkup(
            <ToolCallDetails
                name="SEND_EMAIL"
                input={{}}
                error={'<script>alert("no")</script>'}
                defaultOpen
            />,
        );

        expect(html).toContain("Error");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>");
    });

    it("represents approval states without an AI SDK dependency", () => {
        const html = renderToStaticMarkup(
            <ToolCallDetails
                name="SEND_EMAIL"
                input={{ to: "hello@example.test" }}
                status="approval-requested"
            />,
        );

        expect(html).toContain("Awaiting approval");
        expect(html).toContain('data-tool-status="approval-requested"');
        expect(html).toContain('aria-expanded="false"');
    });
});
