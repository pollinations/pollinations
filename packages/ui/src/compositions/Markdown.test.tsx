import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";
import { Markdown } from "./Markdown.tsx";

describe("Markdown", () => {
    test("renders fenced code as a labelled, copyable, wrapping panel", () => {
        const html = renderToStaticMarkup(
            <Markdown>
                {"```bash\nnpm run build -- --very-long-option\n```"}
            </Markdown>,
        );

        expect(html).toContain(">bash<");
        expect(html).toContain('aria-label="Copy code"');
        expect(html).toContain(">Copy<");
        expect(html).toContain("polli:whitespace-pre-wrap");
        expect(html).toContain("npm run build -- --very-long-option");
    });

    test("keeps inline code compact without a copy control", () => {
        const html = renderToStaticMarkup(
            <Markdown>{"Run `npm run build` locally."}</Markdown>,
        );

        expect(html).toContain("<code");
        expect(html).not.toContain('aria-label="Copy code"');
    });
});
