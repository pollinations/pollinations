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
 * The badge and popup follow the page theme. The popup uses the universal
 * recipe via `<Tooltip>` (`bg-theme-bg-pale` + `border-theme-border` +
 * normal inherited-safe typography, viewport-clamped). Cursor on the badge is
 * `cursor-help`.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
}) => (
    <Tooltip content={content ?? text} ariaLabel={label} className="polli:ml-1">
        <span className="polli:inline-flex polli:h-4 polli:w-4 polli:items-center polli:justify-center polli:rounded-full polli:border polli:border-theme-border polli:bg-theme-bg-active polli:font-bold polli:text-[10px] polli:leading-none polli:text-theme-text-strong polli:transition-colors polli:hover:bg-theme-bg-hover">
            i
        </span>
    </Tooltip>
);
