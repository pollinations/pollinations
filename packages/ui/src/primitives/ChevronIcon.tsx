import type { FC } from "react";
import { cn } from "../lib/cn.ts";

type ChevronIconProps = {
    /** Rotate 180° when expanded/open. */
    expanded?: boolean;
    className?: string;
};

/**
 * Canonical chevron used for collapsibles, dropdown triggers, and select pills
 * across the app. One icon everywhere.
 */
export const ChevronIcon: FC<ChevronIconProps> = ({ expanded, className }) => (
    <svg
        aria-hidden="true"
        width="12"
        height="12"
        viewBox="0 0 12 12"
        className={cn(
            "polli:shrink-0 polli:transition-transform polli:duration-200 polli:ease-out",
            expanded && "polli:rotate-180",
            className,
        )}
    >
        <path
            d="M3 4.5 6 7.5l3-3"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.5"
        />
    </svg>
);
