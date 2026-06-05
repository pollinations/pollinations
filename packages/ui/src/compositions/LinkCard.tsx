import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import { ExternalLinkIcon } from "../primitives/icons/index.tsx";
import { Surface } from "../primitives/Surface.tsx";
import type { ThemeName } from "../theme.ts";

type BaseLinkCardProps = {
    /** Override the cascade theme for this card's subtree. */
    theme?: ThemeName;
    external?: boolean;
    showIcon?: boolean;
    className?: string;
    surfaceClassName?: string;
};

export type LinkCardProps<T extends React.ElementType = "a"> =
    PropsWithChildren<BaseLinkCardProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseLinkCardProps | "as">;

function isExternalHref(href: unknown): boolean {
    return typeof href === "string" && /^https?:\/\//.test(href);
}

export function LinkCard<T extends React.ElementType = "a">({
    as,
    theme,
    external,
    showIcon = true,
    className,
    surfaceClassName,
    children,
    ...linkProps
}: LinkCardProps<T>) {
    const Component: React.ElementType = as || "a";
    const isExternal =
        external ?? isExternalHref((linkProps as { href?: unknown }).href);

    return (
        <Component
            data-theme={theme}
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            className={cn(
                "polli:group polli:block polli:h-full polli:rounded-xl polli:outline-none",
                className,
            )}
            {...linkProps}
        >
            <Surface
                theme={theme}
                variant="card"
                className={cn(
                    "polli:relative polli:flex polli:h-full polli:flex-col polli:gap-2 polli:bg-white/80 polli:p-5",
                    showIcon && isExternal && "polli:pr-10",
                    "polli:transition polli:group-hover:-translate-y-0.5 polli:group-hover:bg-white/95",
                    "polli:group-focus-visible:ring-2 polli:group-focus-visible:ring-theme-border",
                    surfaceClassName,
                )}
            >
                {showIcon && isExternal && (
                    <ExternalLinkIcon
                        aria-hidden="true"
                        className="polli:absolute polli:top-4 polli:right-4 polli:h-3.5 polli:w-3.5 polli:text-theme-text-soft"
                    />
                )}
                {children}
            </Surface>
        </Component>
    );
}
