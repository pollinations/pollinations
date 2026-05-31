import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";
import { Button } from "./Button.tsx";
import { ExternalLinkIcon } from "./icons/index.tsx";

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
        <ExternalLinkIcon
            className="polli:h-4 polli:w-4 polli:shrink-0 polli:opacity-60"
            aria-hidden="true"
        />
    </Button>
);
