import type { FC, ReactNode } from "react";
import { Button } from "../button.tsx";
import type { DashboardTheme } from "../layout/dashboard-theme.ts";

type LinkButtonProps = {
    theme: DashboardTheme;
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
        color={theme}
        weight="light"
        size={size}
        className={className}
    >
        {children}
    </Button>
);
