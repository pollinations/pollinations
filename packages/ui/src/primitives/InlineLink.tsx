import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import { ExternalLinkIcon } from "./icons/index.tsx";

type BaseInlineLinkProps = {
    /** Set explicitly for non-http external links, or false for custom routing components. */
    external?: boolean;
    showIcon?: boolean;
    className?: string;
};

export type InlineLinkProps<T extends React.ElementType = "a"> =
    PropsWithChildren<BaseInlineLinkProps> & {
        as?: T;
    } & Omit<
            React.ComponentPropsWithoutRef<T>,
            keyof BaseInlineLinkProps | "as"
        >;

function isExternalHref(href: unknown): boolean {
    return typeof href === "string" && /^https?:\/\//.test(href);
}

export function InlineLink<T extends React.ElementType = "a">({
    as,
    external,
    showIcon = true,
    className,
    children,
    ...linkProps
}: InlineLinkProps<T>) {
    const Component: React.ElementType = as || "a";
    const isExternal =
        external ?? isExternalHref((linkProps as { href?: unknown }).href);

    return (
        <Component
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={cn(
                "polli-control polli:inline-flex polli:items-center polli:gap-1 polli:rounded-sm polli:font-medium polli:text-theme-text-soft",
                "polli:underline polli:underline-offset-2",
                "polli:transition-colors polli:hover:text-theme-text-strong",
                className,
            )}
            {...linkProps}
        >
            {children}
            {showIcon && isExternal && (
                <ExternalLinkIcon
                    aria-hidden="true"
                    className="polli:h-3.5 polli:w-3.5 polli:shrink-0 polli:opacity-65"
                />
            )}
        </Component>
    );
}
