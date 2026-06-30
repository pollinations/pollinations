import type { FC, ReactNode } from "react";
import { EyeIcon } from "../primitives/icons/index.tsx";
import { Tooltip } from "../primitives/Tooltip.tsx";

type InfoTipProps = {
    text?: ReactNode;
    content?: ReactNode;
    label?: string;
};

/**
 * Small eye trigger that opens a tooltip on hover, click, or focus.
 *
 * The trigger and popup follow the page theme. The popup uses the universal
 * recipe via `<Tooltip>` (`bg-theme-bg-pale` + `border-theme-border` +
 * normal inherited-safe typography, viewport-clamped). Cursor on the trigger
 * is `cursor-help`.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
}) => (
    <Tooltip content={content ?? text} ariaLabel={label} className="polli:ml-1">
        <span className="polli:inline-flex polli:h-4 polli:w-4 polli:items-center polli:justify-center polli:rounded polli:text-theme-text-soft polli:transition-colors polli:hover:bg-theme-bg-active polli:hover:text-theme-text-strong">
            <EyeIcon className="polli:h-3.5 polli:w-3.5" />
        </span>
    </Tooltip>
);
