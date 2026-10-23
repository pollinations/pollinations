import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { TabButton } from "./TabButton.tsx";

describe("TabButton", () => {
    test("passes the native accessible label through to the button", () => {
        const html = renderToStaticMarkup(
            <TabButton active={false} aria-label="Choose model">
                Models
            </TabButton>,
        );
        expect(html).toContain('aria-label="Choose model"');
    });
    test("draws the icon before the label, hidden from assistive tech", () => {
        const html = renderToStaticMarkup(
            <TabButton active={false} icon={<svg data-testid="icon" />}>
                Newest
            </TabButton>,
        );

        expect(html.indexOf("icon")).toBeLessThan(html.indexOf("Newest"));
        expect(html).toContain('aria-hidden="true"');
    });

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

    test("marks a partly selected toggle as mixed with its own tint", () => {
        const mixed = renderToStaticMarkup(
            <TabButton active="mixed">Partial</TabButton>,
        );

        expect(mixed).toContain('aria-pressed="mixed"');
        expect(mixed).toContain("polli:bg-theme-bg-active/45");
        expect(mixed).not.toContain("polli:bg-theme-bg-subtle");
    });

    test("fills only the selected green tab with the Quest colours", () => {
        const active = renderToStaticMarkup(
            <TabButton active intent="green" variant="ghost">
                Active
            </TabButton>,
        );
        const inactive = renderToStaticMarkup(
            <TabButton active={false} intent="green" variant="ghost">
                Inactive
            </TabButton>,
        );

        expect(active).toContain("polli:bg-tier-pale");
        expect(active).toContain("polli:text-tier-deep");
        expect(inactive).toContain("polli:bg-transparent");
        expect(inactive).toContain("polli:text-tier-deep");
    });

    test("fills the selected amber tab with the pale paid colours", () => {
        const active = renderToStaticMarkup(
            <TabButton active intent="amber" variant="ghost">
                Active
            </TabButton>,
        );

        expect(active).toContain("polli:bg-paid-pale");
        expect(active).toContain("polli:text-paid-deep");
        expect(active).not.toContain("polli:bg-theme-bg-active");
    });

    test("renders the detail after the label", () => {
        const html = renderToStaticMarkup(
            <TabButton active={false} detail="@alice">
                Tiny LLM
            </TabButton>,
        );

        expect(html).toMatch(/Tiny LLM<span[^>]*>@alice<\/span>/);
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
            href?: string;
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
        expect(props.href).toBeUndefined();
        expect(event.preventDefault).toHaveBeenCalledOnce();
        expect(event.stopPropagation).toHaveBeenCalledOnce();
    });
});
