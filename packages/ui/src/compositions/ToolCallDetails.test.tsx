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
