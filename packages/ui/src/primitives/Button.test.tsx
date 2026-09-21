import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";
import { ExternalLinkButton } from "../compositions/ExternalLinkButton.tsx";
import { Button } from "./Button.tsx";
import { DialogFooter } from "./Dialog.tsx";

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

    test("supports same-tab product navigation without an external icon", () => {
        const html = renderToStaticMarkup(
            <ExternalLinkButton
                href="https://enter.pollinations.ai"
                external={false}
            >
                Continue
            </ExternalLinkButton>,
        );

        expect(html).not.toContain('target="_blank"');
        expect(html).not.toContain("noopener noreferrer");
        expect(html).not.toContain("<svg");
    });

    test("applies block defaults only inside a dialog footer", () => {
        const button = <Button>Save</Button>;
        expect(renderToStaticMarkup(button)).toContain("polli:rounded-full");
        const footer = renderToStaticMarkup(
            <DialogFooter>{button}</DialogFooter>,
        );
        expect(footer).toContain("polli:rounded-md");
        expect(footer).not.toContain("polli:rounded-full");
    });

    test("makes disabled polymorphic links inert", () => {
        // Render within React so Button can read its footer defaults.
        let element = <span />;
        function Probe() {
            element = Button({
                as: "a",
                href: "/unavailable",
                disabled: true,
                children: "Unavailable",
            });
            return element;
        }
        renderToStaticMarkup(<Probe />);
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
