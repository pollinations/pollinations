import {
    type CSSProperties,
    type FC,
    type MouseEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";
import { cn } from "@/util.ts";

const TOOLTIP_MAX_WIDTH = 288;
const TOOLTIP_VIEWPORT_MARGIN = 12;

type TooltipProps = {
    children: ReactNode;
    content: ReactNode;
    ariaLabel?: string;
    className?: string;
    onClick?: () => void;
    style?: CSSProperties;
    triggerAs?: "button" | "span";
    /**
     * When true, the inner cursor wrapper uses display:contents so the
     * trigger's flex/grid layout applies directly to the caller's children
     * without an inline wrapper in the way.
     */
    displayContents?: boolean;
};

export const Tooltip: FC<TooltipProps> = ({
    children,
    content,
    ariaLabel,
    className,
    onClick,
    style,
    triggerAs = "button",
    displayContents = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState({
        top: 0,
        left: 0,
        maxWidth: TOOLTIP_MAX_WIDTH,
    });
    const triggerRef = useRef<HTMLElement | null>(null);

    const updateTooltipPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            const maxWidth = Math.min(
                TOOLTIP_MAX_WIDTH,
                window.innerWidth - TOOLTIP_VIEWPORT_MARGIN * 2,
            );
            const left = Math.min(
                Math.max(rect.left, TOOLTIP_VIEWPORT_MARGIN),
                Math.max(
                    TOOLTIP_VIEWPORT_MARGIN,
                    window.innerWidth - maxWidth - TOOLTIP_VIEWPORT_MARGIN,
                ),
            );
            setTooltipPosition({
                top: rect.bottom + 4,
                left,
                maxWidth,
            });
        }
    };

    // Universal cursor for every tooltip trigger across the app.
    // `cursor-help` = standard "?" pointer that means "more info on hover".
    const triggerClassName = cn(
        "relative cursor-help text-left inline-flex items-center",
        className,
    );

    const cursorClass = displayContents ? "contents" : "cursor-help";

    // Thin theme-cascade popup. bg + border + text all follow the active
    // page theme so the tooltip reads as "part of the page", not system
    // chrome. Uses the pale theme bg (one step lighter than chip-bg) so
    // it doesn't dominate. Same recipe on desktop and mobile —
    // viewport-clamped via `tooltipPosition`.
    const popupClasses =
        "fixed w-max px-2 py-1 bg-theme-bg-pale text-theme-text-strong border border-theme-border text-xs rounded-md shadow-sm z-50 pointer-events-none transition-opacity whitespace-pre-line break-words";

    const contentNode = (
        <>
            <span className={cursorClass}>{children}</span>
            <span
                style={{
                    top: tooltipPosition.top,
                    left: tooltipPosition.left,
                    maxWidth: tooltipPosition.maxWidth,
                }}
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } ${popupClasses}`}
            >
                {content}
            </span>
        </>
    );

    const sharedProps = {
        "aria-label": ariaLabel,
        className: triggerClassName,
        onMouseEnter: () => {
            updateTooltipPosition();
            setShowTooltip(true);
        },
        onMouseLeave: () => setShowTooltip(false),
        onClick: (e: MouseEvent) => {
            e.stopPropagation();
            if (onClick) {
                onClick();
            }
            if (triggerAs === "span") {
                return;
            }
            updateTooltipPosition();
            setShowTooltip((prev) => !prev);
        },
        style,
    };

    if (triggerAs === "span") {
        return (
            <span
                ref={(node) => {
                    triggerRef.current = node;
                }}
                {...sharedProps}
            >
                {contentNode}
            </span>
        );
    }

    return (
        <button
            ref={(node) => {
                triggerRef.current = node;
            }}
            type="button"
            aria-label={ariaLabel}
            className={triggerClassName}
            onMouseEnter={sharedProps.onMouseEnter}
            onMouseLeave={sharedProps.onMouseLeave}
            onClick={sharedProps.onClick}
            style={style}
        >
            {contentNode}
        </button>
    );
};
