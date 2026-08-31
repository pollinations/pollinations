import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ExternalLinkButton } from "../compositions/ExternalLinkButton.tsx";
import { Button } from "./Button.tsx";

describe("Button appearances", () => {
    test("keeps the pill appearance by default", () => {
        const html = renderToStaticMarkup(<Button>Default</Button>);

        expect(html).toContain('type="button"');
        expect(html).toContain("polli:rounded-full");
        expect(html).not.toContain("polli:border-r-[3px]");
    });

    test("preserves an explicit submit type", () => {
        const html = renderToStaticMarkup(
            <Button type="submit">Submit</Button>,
        );

        expect(html).toContain('type="submit"');
    });

    test("applies the raised appearance to external CTAs", () => {
        const html = renderToStaticMarkup(
            <ExternalLinkButton href="https://example.com" appearance="raised">
                Open
            </ExternalLinkButton>,
        );

        expect(html).toContain("polli:rounded-xl");
        expect(html).toContain("polli:border-r-[3px]");
        expect(html).toContain("polli:border-theme-text-strong/20");
        expect(html).not.toContain("polli:border-brand-dark/20");
        expect(html).toContain('target="_blank"');
    });

    test("makes disabled polymorphic links inert", () => {
        const element = Button({
            as: "a",
            href: "/unavailable",
            disabled: true,
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
