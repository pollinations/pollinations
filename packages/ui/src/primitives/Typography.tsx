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
/** `brand` sets headings in the display faces; `plain` in the body face, for reading pages such as docs. */
export type HeadingFace = "brand" | "plain";

type TextSize = "body" | "sm" | "xs" | "micro";
type TextTone = "base" | "strong" | "soft" | "muted";
type TextWeight = "normal" | "medium" | "semibold" | "bold";

const headingSizeClasses: Record<HeadingSize, string> = {
    display: "polli:text-5xl polli:leading-none",
    title: "polli:text-4xl polli:leading-none",
    section: "polli:text-2xl polli:leading-tight",
    subsection: "polli:text-xl polli:leading-tight",
    card: "polli:text-lg polli:leading-tight",
};

const brandFaceClasses: Record<HeadingSize, string> = {
    display: "polli:font-heading",
    title: "polli:font-heading",
    section: "polli:font-subheading",
    subsection: "polli:font-subheading",
    card: "polli:font-subheading",
};

const plainFaceClass =
    "polli:font-body polli:font-semibold polli:tracking-tight";

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

export function headingClassName(
    size: HeadingSize,
    className?: string,
    face: HeadingFace = "brand",
) {
    return cn(
        "polli:break-words polli:text-theme-text-strong",
        headingSizeClasses[size],
        face === "plain" ? plainFaceClass : brandFaceClasses[size],
        className,
    );
}

function textClassName({
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
    face?: HeadingFace;
    className?: string;
}>;

export type HeadingProps<T extends ElementType = "h2"> = HeadingOwnProps<T> &
    Omit<ComponentPropsWithoutRef<T>, keyof HeadingOwnProps<T>>;

export function Heading<T extends ElementType = "h2">({
    as,
    size = "section",
    face = "brand",
    className,
    children,
    ...rest
}: HeadingProps<T>) {
    const Component = as || "h2";
    return (
        <Component
            {...rest}
            className={headingClassName(size, className, face)}
        >
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
