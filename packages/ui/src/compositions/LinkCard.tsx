import type { CSSProperties, PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";
import { isExternalHref } from "../lib/link.ts";
import { ExternalLinkIcon } from "../primitives/icons/index.tsx";
import { Surface } from "../primitives/Surface.tsx";

type BaseLinkCardProps = {
    external?: boolean;
    showIcon?: boolean;
    /** Card fill (a colour or token var); hover lifts it halfway to white. */
    tint?: string;
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
    tint,
    className,
    surfaceClassName,
    children,
    ...linkProps
}: LinkCardProps<T>) {
    const Component: React.ElementType = as || "a";
    const isExternal =
        external ?? isExternalHref((linkProps as { href?: unknown }).href);
    const style = (linkProps as { style?: CSSProperties }).style;

    return (
        <Surface
            as={Component}
            variant="card"
            target={isExternal ? "_blank" : undefined}
            rel={isExternal ? "noopener noreferrer" : undefined}
            {...linkProps}
            {...(tint && {
                style: { ...style, "--polli-card-tint": tint } as CSSProperties,
            })}
            className={cn(
                "polli:group polli:relative polli:flex polli:h-full polli:flex-col polli:gap-2 polli:bg-surface-opaque/80 polli:p-5 polli:outline-none",
                showIcon && isExternal && "polli:pr-10",
                "polli:transition-colors polli:hover:bg-surface-opaque/95",
                tint &&
                    "polli:bg-(--polli-card-tint) polli:hover:bg-[color-mix(in_oklab,var(--polli-card-tint),var(--polli-color-surface-opaque)_50%)]",
                "polli:focus-visible:ring-2 polli:focus-visible:ring-theme-border",
                className,
                surfaceClassName,
            )}
        >
            {showIcon && isExternal && (
                <ExternalLinkIcon
                    aria-hidden="true"
                    className="polli:absolute polli:top-4 polli:right-4 polli:h-3.5 polli:w-3.5 polli:text-theme-text-soft polli:transition-transform polli:duration-150 polli:group-hover:translate-x-0.5 polli:group-hover:-translate-y-0.5 polli:group-focus-visible:translate-x-0.5 polli:group-focus-visible:-translate-y-0.5 polli:motion-reduce:transition-none polli:motion-reduce:group-hover:translate-0 polli:motion-reduce:group-focus-visible:translate-0"
                />
            )}
            {children}
        </Surface>
    );
}
