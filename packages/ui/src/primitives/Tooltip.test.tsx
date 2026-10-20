import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getTooltipPosition, Tooltip } from "./Tooltip.tsx";

describe("Tooltip", () => {
    it("centres the measured popup and only shifts it at viewport edges", () => {
        const viewport = { width: 800, height: 600 };
        const popup = { width: 80, height: 24 };
        const trigger = { top: 100, bottom: 132, left: 400, width: 32 };
        expect(
            getTooltipPosition(trigger, popup, viewport, "center", true),
        ).toEqual({ top: 136, left: 376 });
        expect(
            getTooltipPosition(
                { ...trigger, left: 760 },
                popup,
                viewport,
                "start",
                true,
            ),
        ).toEqual({ top: 136, left: 708 });
        expect(
            getTooltipPosition(
                { ...trigger, left: 0 },
                popup,
                viewport,
                "center",
                true,
            ).left,
        ).toBe(12);
        expect(
            getTooltipPosition(
                { ...trigger, left: 0 },
                popup,
                viewport,
                "center",
                false,
            ).left,
        ).toBe(-24);
    });

    it("flips above the trigger when the popup would extend below the viewport", () => {
        const trigger = { top: 550, bottom: 582, left: 100, width: 32 };
        const position = getTooltipPosition(
            trigger,
            { width: 100, height: 48 },
            { width: 800, height: 600 },
            "start",
            true,
        );
        expect(position).toEqual({ top: 498, left: 100 });
    });

    it("keeps span triggers non-interactive by default", () => {
        const markup = renderToStaticMarkup(
            <Tooltip triggerAs="span" content="Details">
                Label
            </Tooltip>,
        );

        expect(markup).toContain('role="tooltip"');
        expect(markup).not.toContain('role="button"');
        expect(markup).not.toContain('tabindex="0"');
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

    it("gives button triggers the control class for touch tap sizing", () => {
        const markup = renderToStaticMarkup(
            <Tooltip triggerAs="button" content="Details">
                Button
            </Tooltip>,
        );

        expect(markup).toContain("polli-control");
    });
});
