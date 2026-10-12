import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Tooltip } from "./Tooltip.tsx";

describe("Tooltip", () => {
    it("keeps span triggers non-interactive by default", () => {
        const markup = renderToStaticMarkup(
            <Tooltip triggerAs="span" content="Details">
                Label
            </Tooltip>,
        );

        expect(markup).toContain('role="tooltip"');
        expect(markup).not.toContain('role="button"');
        expect(markup).not.toContain('tabindex="0"');
        // Its touch tap area would cover the control it wraps.
        expect(markup).not.toContain("polli-control");
    });

    it("makes explicitly tap-enabled span triggers operable", () => {
        const markup = renderToStaticMarkup(
            <Tooltip triggerAs="span" content="Details" tapEnabled>
                Label
            </Tooltip>,
        );

        expect(markup).toContain('role="button"');
        expect(markup).toContain('tabindex="0"');
        expect(markup).toContain("polli-control");
    });
});
