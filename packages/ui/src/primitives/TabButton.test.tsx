import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { TabButton } from "./TabButton.tsx";

describe("TabButton", () => {
    test("keeps neutral selected and unselected states distinct", () => {
        const active = renderToStaticMarkup(
            <TabButton active intent="neutral">
                Active
            </TabButton>,
        );
        const inactive = renderToStaticMarkup(
            <TabButton active={false} intent="neutral">
                Inactive
            </TabButton>,
        );

        expect(active).toContain("polli:bg-theme-bg-active");
        expect(active).toContain("polli:text-theme-text-strong");
        expect(inactive).toContain("polli:bg-theme-bg-subtle");
        expect(inactive).toContain("polli:text-theme-text-base");
    });

    test("makes disabled polymorphic links inert", () => {
        const element = TabButton({
            as: "a",
            active: false,
            disabled: true,
            href: "/unavailable",
            children: "Unavailable",
        });
        const props = element.props as {
            "aria-disabled": boolean;
            onClick: (event: {
                preventDefault: () => void;
                stopPropagation: () => void;
            }) => void;
            tabIndex: number;
        };
        const event = {
            preventDefault: vi.fn(),
            stopPropagation: vi.fn(),
        };

        props.onClick(event);

        expect(props["aria-disabled"]).toBe(true);
        expect(props.tabIndex).toBe(-1);
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
});
