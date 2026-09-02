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
            />,
        );

        expect(html).toContain("Tool executed");
        expect(html).toContain("SEARCH_WEB");
        expect(html).toContain("&quot;query&quot;: &quot;pollinations&quot;");
        expect(html).toContain('href="https://example.test/result"');
    });

    it("escapes tool output and labels failures", () => {
        const html = renderToStaticMarkup(
            <ToolCallDetails
                name="SEND_EMAIL"
                input={{}}
                error={'<script>alert("no")</script>'}
            />,
        );

        expect(html).toContain("Tool failed");
        expect(html).toContain("&lt;script&gt;");
        expect(html).not.toContain("<script>");
    });
});
