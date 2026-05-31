import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";
import { Button } from "./Button.tsx";

export type ExternalLinkButtonProps = {
    theme: ThemeName;
    href: string;
    size?: "small" | "medium" | "large";
    className?: string;
    children: ReactNode;
};

export const ExternalLinkButton: FC<ExternalLinkButtonProps> = ({
    theme,
    href,
    size = "medium",
    className,
    children,
}) => (
    <Button
        as="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        theme={theme}
        size={size}
        className={cn("polli:gap-2", className)}
    >
        <span>{children}</span>
        <svg
            viewBox="0 0 24 24"
            className="polli:h-4 polli:w-4 polli:shrink-0 polli:opacity-60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
        >
            <path
                d="M7 17 17 7M9 7h8v8"
                strokeLinecap="round"
                strokeLinejoin="round"
            />
        </svg>
    </Button>
);
