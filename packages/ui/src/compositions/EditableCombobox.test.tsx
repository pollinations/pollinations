import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { EditableComboboxToken } from "./EditableCombobox.tsx";

describe("EditableComboboxToken", () => {
    it("renders an accessible interactive filter token", () => {
        const markup = renderToStaticMarkup(
            <EditableComboboxToken
                label="Source"
                value="official"
                aria-label="Change Source filter: official"
                highlighted
            />,
        );

        expect(markup).toContain("<button");
        expect(markup).toContain('type="button"');
        expect(markup).toContain('aria-label="Change Source filter: official"');
        expect(markup).toContain("Source:");
        expect(markup).toContain("official");
        expect(markup).toContain('data-highlighted=""');
    });
});
