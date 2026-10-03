import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import { isExternalHref } from "../lib/link.ts";
import { ExternalLinkIcon } from "../primitives/icons/index.tsx";
import { Surface } from "../primitives/Surface.tsx";

type BaseLinkCardProps = {
    external?: boolean;
    showIcon?: boolean;
    className?: string;
    surfaceClassName?: string;
};

export type LinkCardProps<T extends React.ElementType = "a"> =
    PropsWithChildren<BaseLinkCardProps> & {
        as?: T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseLinkCardProps | "as">;

export function LinkCard<T extends React.ElementType = "a">({
    as,
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
        <Surface
            as={Component}
            variant="card"
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            {...linkProps}
            className={cn(
                "polli:relative polli:flex polli:h-full polli:flex-col polli:gap-2 polli:bg-surface-opaque/80 polli:p-5 polli:outline-none",
                showIcon && isExternal && "polli:pr-10",
                "polli:transition-colors polli:hover:bg-surface-opaque/95",
                "polli:focus-visible:ring-2 polli:focus-visible:ring-theme-border",
                className,
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
    );
}
