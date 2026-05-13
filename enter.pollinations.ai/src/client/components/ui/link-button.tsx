import type { FC, ReactNode } from "react";
import { cn } from "@/util.ts";
import { Button } from "../button.tsx";
import type { ThemeName } from "../layout/dashboard-theme.ts";

type LinkButtonProps = {
    theme: ThemeName;
    href: string;
    size?: "small" | "medium" | "large";
    className?: string;
    children: ReactNode;
};

export const LinkButton: FC<LinkButtonProps> = ({
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
        weight="light"
        size={size}
        className={cn("gap-2", className)}
    >
        <span>{children}</span>
        <svg
            viewBox="0 0 24 24"
            className="h-4 w-4 shrink-0 opacity-60"
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
