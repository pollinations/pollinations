import type {
    ComponentPropsWithoutRef,
    ElementType,
    PropsWithChildren,
} from "react";
import { cn } from "../lib/cn.ts";

export type HeadingSize =
    | "display"
    | "title"
    | "section"
    | "subsection"
    | "card";

export type TextSize = "body" | "sm" | "xs" | "micro";
export type TextTone = "base" | "strong" | "soft" | "muted";
export type TextWeight = "normal" | "medium" | "semibold" | "bold";

const headingSizeClasses: Record<HeadingSize, string> = {
    display: "polli:font-heading polli:text-5xl polli:leading-none",
    title: "polli:font-heading polli:text-4xl polli:leading-none",
    section: "polli:font-subheading polli:text-2xl polli:leading-tight",
    subsection: "polli:font-subheading polli:text-xl polli:leading-tight",
    card: "polli:font-subheading polli:text-lg polli:leading-tight",
};

const textSizeClasses: Record<TextSize, string> = {
    body: "polli:text-base polli:leading-relaxed",
    sm: "polli:text-sm polli:leading-6",
    xs: "polli:text-xs polli:leading-normal",
    micro: "polli:text-micro polli:leading-normal",
};

const textToneClasses: Record<TextTone, string> = {
    base: "polli:text-theme-text-base",
    strong: "polli:text-theme-text-strong",
    soft: "polli:text-theme-text-soft",
    muted: "polli:text-theme-text-muted",
};

const textWeightClasses: Record<TextWeight, string> = {
    normal: "polli:font-normal",
    medium: "polli:font-medium",
    semibold: "polli:font-semibold",
    bold: "polli:font-bold",
};

export function headingClassName(size: HeadingSize, className?: string) {
    return cn(
        "polli:break-words polli:text-theme-text-strong",
        headingSizeClasses[size],
        className,
    );
}

export function textClassName({
    size,
    tone,
    weight,
    className,
}: {
    size: TextSize;
    tone: TextTone;
    weight: TextWeight;
    className?: string;
}) {
    return cn(
        "polli:break-words polli:font-body",
        textSizeClasses[size],
        textToneClasses[tone],
        textWeightClasses[weight],
        className,
    );
}

type HeadingOwnProps<T extends ElementType> = PropsWithChildren<{
    as?: T;
    size?: HeadingSize;
    className?: string;
}>;

export type HeadingProps<T extends ElementType = "h2"> = HeadingOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof HeadingOwnProps<T>>;

export function Heading<T extends ElementType = "h2">({
    as,
    size = "section",
    className,
    children,
    ...rest
}: HeadingProps<T>) {
    const Component = as || "h2";
    return (
        <Component {...rest} className={headingClassName(size, className)}>
            {children}
        </Component>
    );
}

type TextOwnProps<T extends ElementType> = PropsWithChildren<{
    as?: T;
    size?: TextSize;
    tone?: TextTone;
    weight?: TextWeight;
    className?: string;
}>;

export type TextProps<T extends ElementType = "p"> = TextOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof TextOwnProps<T>>;

export function Text<T extends ElementType = "p">({
    as,
    size = "body",
    tone = "base",
    weight = "normal",
    className,
    children,
    ...rest
}: TextProps<T>) {
    const Component = as || "p";
    return (
        <Component
            {...rest}
            className={textClassName({ size, tone, weight, className })}
        >
            {children}
        </Component>
    );
}
