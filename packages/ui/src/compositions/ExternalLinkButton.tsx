import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Button } from "../primitives/Button.tsx";
import { ExternalLinkIcon } from "../primitives/icons/index.tsx";

type ExternalLinkButtonBaseProps = {
    size?: "sm" | "md" | "lg";
    className?: string;
    children: ReactNode;
};

type ExternalLinkButtonAnchorProps = ExternalLinkButtonBaseProps & {
    href: string;
} & Omit<ComponentPropsWithoutRef<"a">, "children" | "className" | "href">;

type ExternalLinkButtonNativeButtonProps = ExternalLinkButtonBaseProps &
    Omit<ComponentPropsWithoutRef<"button">, "children" | "className">;

export type ExternalLinkButtonProps =
    | ExternalLinkButtonAnchorProps
    | ExternalLinkButtonNativeButtonProps;

export function ExternalLinkButton(props: ExternalLinkButtonProps) {
    const { size = "md", className, children } = props;
    const content = (
        <>
            <span>{children}</span>
            <ExternalLinkIcon
                className="polli:h-4 polli:w-4 polli:shrink-0 polli:opacity-60"
                aria-hidden="true"
            />
        </>
    );

    if ("href" in props) {
        const {
            href,
            target = "_blank",
            rel = target === "_blank" ? "noopener noreferrer" : undefined,
            size: _size,
            className: _className,
            children: _children,
            ...anchorProps
        } = props;

        return (
            <Button
                as="a"
                href={href}
                target={target}
                rel={rel}
                size={size}
                className={cn("polli:gap-2", className)}
                {...anchorProps}
            >
                {content}
            </Button>
        );
    }

    const {
        type = "button",
        size: _size,
        className: _className,
        children: _children,
        ...buttonProps
    } = props;

    return (
        <Button
            as="button"
            type={type}
            size={size}
            className={cn("polli:gap-2", className)}
            {...buttonProps}
        >
            {content}
        </Button>
    );
}
