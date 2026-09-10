import type { FC, ReactNode } from "react";
import { Tooltip } from "../primitives/Tooltip.tsx";

type InfoTipProps = {
    text?: ReactNode;
    content?: ReactNode;
    label?: string;
};

/**
 * Small "i" badge that opens a tooltip on hover, click, or focus.
 *
 * Quiet neutral badge and shared, viewport-clamped tooltip popup.
 * The help cursor indicates that more information is available.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
}) => (
    <Tooltip content={content ?? text} ariaLabel={label} className="polli:ml-1">
        <span className="polli:inline-flex polli:h-4 polli:w-4 polli:items-center polli:justify-center polli:rounded-full polli:bg-surface-menu polli:font-bold polli:text-[10px] polli:leading-none polli:text-theme-text-muted polli:transition-colors polli:hover:text-theme-text-strong">
            i
        </span>
    </Tooltip>
);
