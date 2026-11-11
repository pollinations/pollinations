import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ModelDescription } from "../frontend/src/components/models/model-description.tsx";

describe("model description", () => {
    it("clamps the text and wires the Show more toggle to it", () => {
        const markup = renderToStaticMarkup(
            <ModelDescription text="Free behaviour scoring for agent conversations." />,
        );
        const id = markup.match(/<p[^>]* id="([^"]+)"/)?.[1];

        expect(markup).toContain("line-clamp-2");
        expect(markup).toContain(
            "Free behaviour scoring for agent conversations.",
        );
        expect(id).toBeTruthy();
        expect(markup).toContain(`aria-controls="${id}"`);
        expect(markup).toContain('aria-expanded="false"');
        expect(markup).toContain('type="button"');
        expect(markup).toContain("Show more");
    });

    it("hides the toggle until the text is measured as clamped", () => {
        const markup = renderToStaticMarkup(<ModelDescription text="Short." />);

        expect(markup).toMatch(/<button[^>]* hidden=""/);
    });
});
