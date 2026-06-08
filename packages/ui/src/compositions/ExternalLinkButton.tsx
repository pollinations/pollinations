import type { FC, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Button } from "../primitives/Button.tsx";
import { ExternalLinkIcon } from "../primitives/icons/index.tsx";

export type ExternalLinkButtonProps = {
    href: string;
    size?: "sm" | "md" | "lg";
    className?: string;
    children: ReactNode;
};

export const ExternalLinkButton: FC<ExternalLinkButtonProps> = ({
    href,
    size = "md",
    className,
    children,
}) => (
    <Button
        as="a"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
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
