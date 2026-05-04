import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";
import { panelColors } from "../layout/dashboard-theme.ts";

type PanelProps = PropsWithChildren<{
    color?: keyof typeof panelColors;
    compact?: boolean;
    className?: string;
}>;

export const Panel: FC<PanelProps> = ({
    color = "green",
    compact = false,
    className,
    children,
}) => (
    <div
        className={cn(
            "min-w-0 rounded-2xl border",
            compact ? "p-4" : "p-6",
            panelColors[color],
            className,
        )}
    >
        {children}
    </div>
);
