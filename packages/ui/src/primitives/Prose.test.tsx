import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Prose } from "./Prose.tsx";

const markdown = [
    "# Title",
    "",
    "Some **bold** text and a [link](https://example.com).",
    "",
    "| Col A | Col B |",
    "| ----- | ----- |",
    "| 1     | 2     |",
    "",
    "`inline code`",
].join("\n");

describe("Prose", () => {
    it("renders headings with rehype-slug ids and heading font", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<h1");
        expect(html).toContain('id="title"');
        expect(html).toContain("polli:font-heading");
    });

    it("renders gfm tables and themed links", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<table");
        expect(html).toContain('href="https://example.com"');
        expect(html).toContain("polli:underline");
    });

    it("renders inline code and bold", () => {
        const html = renderToStaticMarkup(<Prose>{markdown}</Prose>);
        expect(html).toContain("<code");
        expect(html).toContain("polli:font-pixel");
        expect(html).toContain("<strong");
    });
});
