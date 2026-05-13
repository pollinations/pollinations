import { type FC, type ReactNode, useId, useState } from "react";

type InfoTipProps = {
    text?: ReactNode;
    content?: ReactNode;
    label?: string;
    placement?: "top" | "bottom";
};

/**
 * Small "i" badge with a thin dark tooltip popup on hover, click, or
 * focus. The badge itself follows the page theme via the cascade; the
 * popup uses the universal dark tooltip recipe (same as `<Tooltip>`).
 *
 * Cursor on the badge is `cursor-help` — matches every other tooltip
 * trigger in the system.
 */
export const InfoTip: FC<InfoTipProps> = ({
    text,
    content,
    label = "More info",
    placement = "bottom",
}) => {
    const [show, setShow] = useState(false);
    const tooltipId = useId();
    const placementClasses =
        placement === "top" ? "bottom-full mb-1" : "top-full mt-1";

    return (
        <button
            type="button"
            className="relative inline-flex items-center ml-1 cursor-help"
            onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShow((prev) => !prev);
            }}
            onMouseEnter={() => setShow(true)}
            onMouseLeave={() => setShow(false)}
            onFocus={() => setShow(true)}
            onBlur={() => setShow(false)}
            aria-label={label}
            aria-expanded={show}
            aria-describedby={show ? tooltipId : undefined}
        >
            <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full border border-theme-border bg-theme-chip-bg text-theme-text-strong text-micro font-bold transition-colors">
                i
            </span>
            <span
                id={tooltipId}
                role="tooltip"
                className={`${show ? "visible opacity-100" : "invisible opacity-0"} absolute left-1/2 -translate-x-1/2 ${placementClasses} z-50 w-[200px] sm:w-[280px] px-2 py-1 bg-theme-bg-pale text-theme-text-strong border border-theme-border text-xs rounded-md shadow-sm pointer-events-none whitespace-pre-line break-words text-left font-normal transition-opacity`}
            >
                {content ?? text}
            </span>
        </button>
    );
};
