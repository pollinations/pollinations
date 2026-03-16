import type { FC, PropsWithChildren } from "react";
import { cn } from "../../../util.ts";

const panelColors = {
    blue: "border-blue-300 bg-blue-50/70",
    teal: "border-teal-200 bg-teal-50/70",
    violet: "border-violet-300 bg-violet-50/70",
    purple: "border-purple-300 bg-purple-50/70",
    amber: "border-amber-300 bg-amber-50/70",
    green: "border-green-200 bg-green-50/70",
    pink: "border-pink-300 bg-pink-50/70",
    gray: "border-gray-300 bg-gray-50/70",
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
