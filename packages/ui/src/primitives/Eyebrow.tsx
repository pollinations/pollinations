import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";
import { cn } from "../lib/cn.ts";

const sizeClasses = {
    page: "polli:text-sm polli:tracking-widest polli:text-theme-text-soft",
    card: "polli:text-xs polli:tracking-wider polli:text-theme-text-soft",
    chrome: "polli:text-micro polli:tracking-widest polli:text-theme-text-muted",
} as const;

type EyebrowOwnProps<T extends ElementType> = {
    as?: T;
    size?: keyof typeof sizeClasses;
    className?: string;
    children: ReactNode;
};

export type EyebrowProps<T extends ElementType = "span"> = EyebrowOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof EyebrowOwnProps<T>>;

/** Uppercase pixel label for page, card, and chrome metadata. */
export function Eyebrow<T extends ElementType = "span">({
    as,
    size = "card",
    className,
    children,
    ...rest
}: EyebrowProps<T>) {
    const Component: ElementType = as || "span";

    return (
        <Component
            {...rest}
            className={cn(
                "polli:font-pixel polli:uppercase",
                sizeClasses[size],
                className,
            )}
        >
            {children}
        </Component>
    );
}
