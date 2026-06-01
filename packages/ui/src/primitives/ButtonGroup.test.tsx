import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Button } from "./Button.tsx";
import { ButtonGroup } from "./ButtonGroup.tsx";

describe("ButtonGroup", () => {
    it("renders grouped buttons with wrapped layout", () => {
        const html = renderToStaticMarkup(
            <ButtonGroup aria-label="Actions">
                <Button>One</Button>
                <Button>Two</Button>
            </ButtonGroup>,
        );

        expect(html).toContain('aria-label="Actions"');
        expect(html).toContain('role="group"');
        expect(html).toContain("polli:flex-wrap");
        expect(html).toContain("One");
        expect(html).toContain("Two");
    });
});
