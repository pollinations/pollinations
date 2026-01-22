import type { Link, LinkProps } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { cn } from "../../util.ts";

const colors = {
    green: {
        light: "bg-green-200 text-green-900",
        strong: "bg-green-950 text-green-100",
        outline:
            "border border-green-950 text-green-950 hover:bg-green-950 hover:text-green-100 transition-colors",
    },
    pink: {
        light: "bg-fuchsia-200 text-fuchsia-900",
        strong: "bg-fuchsia-900 text-fuchsia-50",
        outline: "border-2 border-fuchsia-900 text-fuchsia-900",
    },
    blue: {
        light: "bg-blue-200 text-blue-900",
        strong: "bg-blue-900 text-blue-50",
        outline: "border-2 border-blue-900 text-blue-900",
    },
    purple: {
        light: "bg-indigo-200 text-indigo-900",
        strong: "bg-indigo-900 text-indigo-50",
        outline: "border-2 border-indigo-900 text-indigo-900",
    },
    red: {
        light: "bg-red-200 text-red-900",
        strong: "bg-red-900 text-red-50",
        outline: "border-2 border-red-900 text-red-900",
    },
    amber: {
        light: "bg-amber-200 text-amber-900",
        strong: "bg-amber-500 text-white",
        outline: "border-2 border-amber-500 text-amber-900",
    },
    violet: {
        light: "bg-violet-200 text-violet-900",
        strong: "bg-violet-600 text-white",
        outline: "border-2 border-violet-600 text-violet-900",
    },
} as const;

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
        "rounded-full self-center placeholder-green-950 font-medium box-border",
        disabled
            ? "opacity-50 cursor-not-allowed"
            : "hover:filter hover:brightness-105 cursor-pointer",
        colors[color || "green"][weight || "strong"],
        weight === "outline"
            ? outlineSizes[size || "medium"]
            : sizes[size || "medium"],
        shapes[shape || "pill"],
        className,
    );

type BaseButtonProps = {
    color?: keyof typeof colors;
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
