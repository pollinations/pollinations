import type { PropsWithChildren } from "react";
import { cn } from "../lib/cn.ts";

type BaseDropdownItemProps = {
    className?: string;
};

export type DropdownItemProps<T extends React.ElementType = "button"> =
    PropsWithChildren<BaseDropdownItemProps> & {
        as?: T;
    } & Omit<
            React.ComponentPropsWithoutRef<T>,
            keyof BaseDropdownItemProps | "as"
        >;

export function DropdownItem<T extends React.ElementType = "button">({
    as,
    className,
    children,
    ...rest
}: DropdownItemProps<T>) {
    const Component: React.ElementType = as || "button";
    return (
        <Component
            {...(Component === "button" ? { type: "button" } : undefined)}
            {...rest}
            className={cn(
                "polli-control polli:flex polli:w-full polli:cursor-pointer polli:items-center polli:gap-2 polli:rounded-lg polli:bg-transparent polli:px-3 polli:py-2 polli:text-left polli:text-sm polli:font-medium polli:text-theme-text-base polli:no-underline polli:transition-colors polli:hover:bg-theme-bg-hover polli:focus-visible:bg-theme-bg-hover",
                className,
            )}
        >
            {children}
        </Component>
    );
}
