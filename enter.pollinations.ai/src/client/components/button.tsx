import type { Link, LinkProps } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { cn } from "../../util.ts";
import { buttonColors } from "./layout/dashboard-theme.ts";

const sizes = {
    small: "px-2 pt-0.5 pb-1",
    medium: "px-4 pt-1.5 pb-2",
    large: "px-6 py-3",
} as const;

const outlineSizes = {
    small: "px-[6px] pt-[0px] pb-[2px]",
    medium: "px-[14px] pt-[4px] pb-[6px]",
    large: "px-[22px] py-[10px]",
} as const;

const shapes = {
    pill: "rounded-full",
    rounded: "rounded",
    rect: "rounded-none",
};

const buttonClasses = ({
    color,
    weight,
    size,
    shape,
    className,
    disabled,
}: BaseButtonProps & { disabled?: boolean }) =>
    cn(
        "inline-flex items-center justify-center rounded-full self-center placeholder-green-950 font-medium leading-normal box-border",
        disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:filter hover:brightness-105 cursor-pointer",
        buttonColors[color || "green"][weight || "strong"],
        weight === "outline"
            ? outlineSizes[size || "medium"]
            : sizes[size || "medium"],
        shapes[shape || "pill"],
        className,
    );

type BaseButtonProps = {
    color?: keyof typeof buttonColors;
    weight?: "light" | "strong" | "outline";
    size?: keyof typeof sizes;
    shape?: keyof typeof shapes;
    className?: string;
    disabled?: boolean;
};

type ButtonElement =
    | React.ElementType<{}, "a">
    | React.ElementType<{}, "div">
    | React.ElementType<{}, "button">;

type ButtonAsElementProps<T extends ButtonElement> =
    PropsWithChildren<BaseButtonProps> & {
        as?: T extends typeof Link ? never : T;
    } & Omit<React.ComponentPropsWithoutRef<T>, keyof BaseButtonProps>;

type ButtonAsLinkProps = PropsWithChildren<BaseButtonProps> & {
    as: typeof Link;
} & Omit<LinkProps, keyof BaseButtonProps>;

type ButtonProps<T extends React.ElementType> = T extends ButtonElement
    ? ButtonAsElementProps<T>
    : ButtonAsLinkProps;

export function Button<T extends React.ElementType>({
    as,
    children,
    color,
    weight,
    size,
    shape,
    className,
    disabled,
    ...buttonProps
}: ButtonProps<T>) {
    const Component = as || "button";

    return (
        <Component
            className={buttonClasses({
                color,
                weight,
                size,
                shape,
                className,
                disabled,
            })}
            disabled={disabled}
            {...buttonProps}
        >
            {children}
        </Component>
    );
}
