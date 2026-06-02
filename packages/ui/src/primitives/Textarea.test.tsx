import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Textarea } from "./Textarea.tsx";

describe("Textarea", () => {
    it("renders a textarea with default rows and base classes", () => {
        const html = renderToStaticMarkup(<Textarea placeholder="Prompt" />);
        expect(html).toContain("<textarea");
        expect(html).toContain('placeholder="Prompt"');
        expect(html).toContain('rows="4"');
        expect(html).toContain("polli:border-gray-300");
    });

    it("applies the error border when error is set", () => {
        const html = renderToStaticMarkup(<Textarea error />);
        expect(html).toContain("polli:border-red-400");
        expect(html).not.toContain("polli:border-gray-300");
    });

    it("forwards disabled and arbitrary textarea props", () => {
        const html = renderToStaticMarkup(
            <Textarea disabled rows={8} aria-label="Notes" />,
        );
        expect(html).toContain("disabled");
        expect(html).toContain('rows="8"');
        expect(html).toContain('aria-label="Notes"');
    });
});
