import type { FC, ReactNode } from "react";
import { Tooltip } from "./tooltip.tsx";

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
 *
 * Wrapping `<Tooltip>` keeps positioning + clamping logic in one place
 * — InfoTip only owns the badge styling.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
}) => (
    <Tooltip content={content ?? text} ariaLabel={label} className="ml-1">
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-theme-border bg-theme-bg-active font-bold text-micro text-theme-text-strong transition-colors">
            i
        </span>
    </Tooltip>
);
