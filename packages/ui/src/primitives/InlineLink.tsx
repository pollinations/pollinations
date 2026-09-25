import type { PropsWithChildren } from "react";
import { isExternalHref } from "../lib/link.ts";
import { ExternalLinkIcon } from "./icons/index.tsx";

type BaseInlineLinkProps = {
    /** Set explicitly for non-http external links, or false for custom routing components. */
    external?: boolean;
    showIcon?: boolean;
    /** Inline text inherits its size; footers use 13px and standalone links 14px. */
    size?: "inherit" | "footer" | "sm";
    /** Accent for prominent links; quiet for secondary navigation. */
    tone?: "accent" | "quiet";
    className?: string;
};

export type InlineLinkProps<T extends React.ElementType = "a"> =
    PropsWithChildren<BaseInlineLinkProps> & {
        as?: T;
    } & Omit<
            React.ComponentPropsWithoutRef<T>,
            keyof BaseInlineLinkProps | "as"
        >;

/** Shared text-link rule: surrounding font, selectable ink, persistent underline,
 * visible keyboard focus, and an external arrow only when leaving the app.
 * Navigation and button-shaped actions use their own primitives.
 */
export function InlineLink<T extends React.ElementType = "a">({
    as,
    external,
    showIcon = true,
    size = "inherit",
    tone = "accent",
    className,
    children,
    ...linkProps
}: InlineLinkProps<T>) {
    const Component: React.ElementType = as || "a";
    const isExternal =
        external ?? isExternalHref((linkProps as { href?: unknown }).href);

    return (
        <Component
            target={isExternal && as !== "button" ? "_blank" : undefined}
            rel={
                isExternal && as !== "button"
                    ? "noopener noreferrer"
                    : undefined
            }
            className={["polli-link", className].filter(Boolean).join(" ")}
            data-size={size}
            data-tone={tone}
            {...linkProps}
        >
            {children}
            {showIcon && isExternal && (
                <ExternalLinkIcon
                    aria-hidden="true"
                    className="polli-link-external-icon"
                />
            )}
        </Component>
    );
}
