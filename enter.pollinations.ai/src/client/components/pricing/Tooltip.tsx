import type { FC, ReactNode } from "react";

type TooltipProps = {
    children: ReactNode;
    text: string;
};

export const Tooltip: FC<TooltipProps> = ({ children, text }) => (
    <span className="relative group/tip">
        <span>{children}</span>
        <span className="invisible group-hover/tip:visible absolute left-1/2 -translate-x-1/2 top-full mt-1 px-2 py-1 bg-gradient-to-r from-pink-50 to-purple-50 text-gray-800 text-xs rounded-lg shadow-lg border border-pink-200 whitespace-nowrap z-50 pointer-events-none">
            {text}
        </span>
    </span>
);
