import type { FC, ReactNode } from "react";
import { Tooltip } from "./Tooltip.tsx";

type InfoTipProps = {
    text?: ReactNode;
    content?: ReactNode;
    label?: string;
};

/**
 * Small "i" badge that opens a tooltip on hover, click, or focus.
 *
 * Both the badge and the popup follow the page theme: badge reads
 * `bg-theme-bg-active`; popup uses the universal recipe via `<Tooltip>`
 * (`bg-theme-bg-pale` + `border-theme-border` + `text-theme-text-strong`,
 * viewport-clamped). Cursor on the badge is `cursor-help`.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
}) => (
    <Tooltip content={content ?? text} ariaLabel={label} className="polli:ml-1">
        <span className="polli:inline-flex polli:h-3.5 polli:w-3.5 polli:items-center polli:justify-center polli:rounded-full polli:border polli:border-theme-border polli:bg-theme-bg-active polli:font-bold polli:text-micro polli:text-theme-text-strong polli:transition-colors">
            i
        </span>
    </Tooltip>
);
