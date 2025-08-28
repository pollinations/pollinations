import type { FC } from "react";
import { cn } from "../../util.ts";
import { Link, LinkProps } from "@tanstack/react-router";

const variants = {
    default: "bg-green-950 text-green-100",
    outline: "border-2 border-green-950 text-green-950",
    pink: "bg-fuchsia-200 text-fuchsia-900",
    blue: "bg-blue-200 text-blue-900",
    green: "bg-green-200 text-green-900",
    purple: "bg-indigo-200 text-indigo-900",
    red: "bg-red-200 text-red-900",
} as const;

const sizes = {
    small: "px-2 pt-0.5 pb-1",
    medium: "px-4 pt-1.5 pb-2",
    large: "px-6 py-3",
} as const;

const shapes = {
    pill: "rounded-full",
    rounded: "rounded",
    rect: "rounded-none",
};

type ButtonStyles = {
    variant?: keyof typeof variants;
    size?: keyof typeof sizes;
    shape?: keyof typeof shapes;
    className?: string;
};

const buttonClasses = ({ variant, size, shape, className }: ButtonStyles) =>
    cn(
        "rounded-full self-center placeholder-green-950 font-medium",
        "hover:filter hover:brightness-105 cursor-pointer",
        variants[variant || "default"],
        sizes[size || "medium"],
        shapes[shape || "pill"],
        className,
    );

export type ButtonProps = React.ComponentPropsWithoutRef<"button"> &
    ButtonStyles;

export const Button: FC<ButtonProps> = ({
    children,
    variant,
    size,
    shape,
    className,
    ...buttonProps
}) => {
    return (
        <button
            className={buttonClasses({ variant, size, shape, className })}
            {...buttonProps}
        >
            {children}
        </button>
    );
};

export type LinkButtonProps = LinkProps & ButtonStyles;

export const LinkButton: FC<LinkButtonProps> = ({
    children,
    variant,
    size,
    shape,
    className,
    ...buttonProps
}) => {
    return (
        <Link
            className={buttonClasses({ variant, size, shape, className })}
            {...buttonProps}
        >
            {children}
        </Link>
    );
};
