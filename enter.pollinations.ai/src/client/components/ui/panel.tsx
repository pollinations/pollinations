import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const panelColors = {
    blue: "border-blue-300 bg-blue-50/30",
    teal: "border-teal-200 bg-teal-50/30",
    violet: "border-violet-300 bg-violet-50/30",
    amber: "border-amber-300 bg-amber-50/30",
    green: "border-green-200 bg-green-50/30",
} as const;

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
            "rounded-2xl border",
            compact ? "p-4" : "p-6",
            panelColors[color],
            className,
        )}
    >
        {children}
    </div>
);
