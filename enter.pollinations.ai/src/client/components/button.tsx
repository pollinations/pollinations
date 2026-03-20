import type { Link, LinkProps } from "@tanstack/react-router";
import type { PropsWithChildren } from "react";
import { cn } from "../../util.ts";

const colors = {
    green: {
        light: "bg-green-200 text-green-900 hover:bg-green-300 dark:bg-green-800 dark:text-green-100 dark:hover:bg-green-700",
        strong: "bg-green-950 text-green-100 hover:bg-green-800 dark:bg-green-700 dark:text-green-100 dark:hover:bg-green-600",
        outline:
            "border-2 border-green-950 text-green-950 hover:bg-green-950 hover:text-green-100 transition-colors dark:border-green-400 dark:text-green-400 dark:hover:bg-green-400 dark:hover:text-gray-900",
    },
    pink: {
        light: "bg-fuchsia-200 text-fuchsia-900 dark:bg-fuchsia-800 dark:text-fuchsia-100",
        strong: "bg-fuchsia-900 text-fuchsia-50 dark:bg-fuchsia-700 dark:text-fuchsia-50",
        outline: "border-2 border-fuchsia-900 text-fuchsia-900 dark:border-fuchsia-400 dark:text-fuchsia-400",
    },
    blue: {
        light: "bg-blue-200 text-blue-900 dark:bg-blue-800 dark:text-blue-100",
        strong: "bg-blue-900 text-blue-50 dark:bg-blue-700 dark:text-blue-50",
        outline: "border-2 border-blue-900 text-blue-900 dark:border-blue-400 dark:text-blue-400",
    },
    purple: {
        light: "bg-indigo-200 text-indigo-900 dark:bg-indigo-800 dark:text-indigo-100",
        strong: "bg-indigo-900 text-indigo-50 dark:bg-indigo-700 dark:text-indigo-50",
        outline: "border-2 border-indigo-900 text-indigo-900 dark:border-indigo-400 dark:text-indigo-400",
    },
    red: {
        light: "bg-red-200 text-red-900 hover:bg-red-300 dark:bg-red-800 dark:text-red-100 dark:hover:bg-red-700",
        strong: "bg-red-900 text-red-50 hover:bg-red-700 dark:bg-red-700 dark:text-red-50 dark:hover:bg-red-600",
        outline:
            "border-2 border-red-700 text-red-700 hover:bg-red-700 hover:text-white transition-colors dark:border-red-400 dark:text-red-400 dark:hover:bg-red-400 dark:hover:text-gray-900",
    },
    amber: {
        light: "bg-amber-200 text-amber-900 hover:bg-amber-300 dark:bg-amber-800 dark:text-amber-100 dark:hover:bg-amber-700",
        strong: "bg-amber-500 text-white hover:bg-amber-400 dark:bg-amber-600 dark:text-white dark:hover:bg-amber-500",
        outline:
            "border-2 border-amber-500 text-amber-900 hover:bg-amber-500 hover:text-white transition-colors dark:border-amber-400 dark:text-amber-400 dark:hover:bg-amber-400 dark:hover:text-gray-900",
    },
    violet: {
        light: "bg-violet-200 text-violet-900 dark:bg-violet-800 dark:text-violet-100",
        strong: "bg-violet-600 text-white dark:bg-violet-700 dark:text-white",
        outline: "border-2 border-violet-600 text-violet-900 dark:border-violet-400 dark:text-violet-400",
    },
    teal: {
        light: "bg-teal-200 text-teal-900 hover:bg-teal-300 dark:bg-teal-800 dark:text-teal-100 dark:hover:bg-teal-700",
        strong: "bg-teal-600 text-white hover:bg-teal-500 dark:bg-teal-700 dark:text-white dark:hover:bg-teal-600",
        outline:
            "border-2 border-teal-600 text-teal-900 hover:bg-teal-600 hover:text-white transition-colors dark:border-teal-400 dark:text-teal-400 dark:hover:bg-teal-400 dark:hover:text-gray-900",
    },
    dark: {
        light: "bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600",
        strong: "bg-gray-900 text-white hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200",
        outline:
            "border-2 border-gray-900 text-gray-900 hover:bg-gray-900 hover:text-white transition-colors dark:border-gray-300 dark:text-gray-300 dark:hover:bg-gray-300 dark:hover:text-gray-900",
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
