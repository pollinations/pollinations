import {
    type CSSProperties,
    type FC,
    type MouseEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";
import { cn } from "../lib/cn.ts";

const TOOLTIP_MAX_WIDTH = 288;
const TOOLTIP_VIEWPORT_MARGIN = 12;

type TooltipProps = {
    children: ReactNode;
    content: ReactNode;
    align?: "start" | "center";
    ariaLabel?: string;
    clampToViewport?: boolean;
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
    align = "start",
    ariaLabel,
    clampToViewport = true,
    className,
    onClick,
    style,
    triggerAs = "button",
    displayContents = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<{
        top: number;
        left: number;
        maxWidth: number;
        transform?: CSSProperties["transform"];
    }>({
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
            let left =
                align === "center" ? rect.left + rect.width / 2 : rect.left;
            let transform: CSSProperties["transform"] =
                align === "center" ? "translateX(-50%)" : undefined;
            if (clampToViewport) {
                left = Math.min(
                    Math.max(rect.left, TOOLTIP_VIEWPORT_MARGIN),
                    Math.max(
                        TOOLTIP_VIEWPORT_MARGIN,
                        window.innerWidth - maxWidth - TOOLTIP_VIEWPORT_MARGIN,
                    ),
                );
                transform = undefined;
            }
            setTooltipPosition({
                top: rect.bottom + 4,
                left,
                maxWidth,
                transform,
            });
        }
    };

    // Universal cursor for every tooltip trigger across the app.
    // `cursor-help` = standard "?" pointer that means "more info on hover".
    const triggerClassName = cn(
        "polli-control polli:relative polli:cursor-help polli:text-left polli:inline-flex polli:items-center",
        className,
    );

    const cursorClass = displayContents
        ? "polli:contents"
        : "polli:cursor-help";

    // Thin theme-cascade popup. bg + border + text follow the active page
    // theme, while typography opts out of trigger inheritance so bold labels
    // do not make the whole tooltip shout.
    const popupClasses =
        "polli:fixed polli:w-max polli:px-2 polli:py-1 polli:bg-theme-bg-pale polli:text-theme-text-base polli:font-normal polli:leading-snug polli:tracking-normal polli:normal-case polli:not-italic polli:border polli:border-theme-border polli:text-xs polli:rounded-md polli:z-50 polli:pointer-events-none polli:transition-opacity polli:whitespace-pre-line polli:break-words";

    const contentNode = (
        <>
            <span className={cursorClass}>{children}</span>
            {content ? (
                <span
                    style={{
                        top: tooltipPosition.top,
                        left: tooltipPosition.left,
                        maxWidth: tooltipPosition.maxWidth,
                        transform: tooltipPosition.transform,
                    }}
                    className={`${
                        showTooltip
                            ? "polli:visible polli:opacity-100"
                            : "polli:invisible polli:opacity-0"
                    } ${popupClasses}`}
                >
                    {content}
                </span>
            ) : null}
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
