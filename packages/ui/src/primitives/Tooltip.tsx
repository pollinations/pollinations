import {
    type CSSProperties,
    cloneElement,
    type FC,
    Fragment,
    isValidElement,
    type KeyboardEvent,
    type MouseEvent,
    type ReactNode,
    useEffect,
    useId,
    useLayoutEffect,
    useRef,
    useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "../lib/cn.ts";

const TOOLTIP_MAX_WIDTH = 288;
const TOOLTIP_VIEWPORT_MARGIN = 12;

/** Internal geometry, using the popup's measured size rather than its max-width. */
export function getTooltipPosition(
    trigger: Pick<DOMRect, "top" | "bottom" | "left" | "width">,
    popup: Pick<DOMRect, "width" | "height">,
    viewport: { width: number; height: number },
    align: "start" | "center",
    clampToViewport: boolean,
) {
    let left =
        align === "center"
            ? trigger.left + (trigger.width - popup.width) / 2
            : trigger.left;
    if (clampToViewport) {
        left = Math.max(
            TOOLTIP_VIEWPORT_MARGIN,
            Math.min(
                left,
                viewport.width - popup.width - TOOLTIP_VIEWPORT_MARGIN,
            ),
        );
    }
    let top = trigger.bottom + 4;
    if (top + popup.height > viewport.height - TOOLTIP_VIEWPORT_MARGIN) {
        top = trigger.top - popup.height - 4;
    }
    return { top: Math.max(TOOLTIP_VIEWPORT_MARGIN, top), left };
}

type TooltipProps = {
    children: ReactNode;
    content: ReactNode;
    align?: "start" | "center";
    ariaLabel?: string;
    clampToViewport?: boolean;
    className?: string;
    maxWidth?: number;
    onClick?: () => void;
    stopClickPropagation?: boolean;
    style?: CSSProperties;
    tapEnabled?: boolean;
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
    maxWidth = TOOLTIP_MAX_WIDTH,
    onClick,
    stopClickPropagation = true,
    style,
    tapEnabled = false,
    triggerAs = "button",
    displayContents = false,
}) => {
    const [showTooltip, setShowTooltip] = useState(false);
    const [tooltipPosition, setTooltipPosition] = useState<{
        top: number;
        left: number;
    }>({
        top: 0,
        left: 0,
    });
    const triggerRef = useRef<HTMLElement | null>(null);
    const popupRef = useRef<HTMLSpanElement | null>(null);
    const tapPinnedRef = useRef(false);
    const closeTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);
    const tooltipId = useId();

    const openTooltip = () => {
        clearTimeout(closeTimeoutRef.current);
        setShowTooltip(true);
    };
    const closeTooltip = () => {
        clearTimeout(closeTimeoutRef.current);
        tapPinnedRef.current = false;
        setShowTooltip(false);
    };
    const scheduleCloseTooltip = () => {
        clearTimeout(closeTimeoutRef.current);
        // Leave time to cross the gap between the trigger and popup.
        closeTimeoutRef.current = setTimeout(() => {
            if (
                !tapPinnedRef.current &&
                !triggerRef.current?.matches(":hover, :focus-within") &&
                !popupRef.current?.matches(":hover")
            ) {
                setShowTooltip(false);
            }
        }, 150);
    };

    useEffect(() => () => clearTimeout(closeTimeoutRef.current), []);

    useEffect(() => {
        if (!showTooltip) return;

        const dismissOnOutsideTap = (event: PointerEvent) => {
            if (
                triggerRef.current?.contains(event.target as Node) ||
                popupRef.current?.contains(event.target as Node)
            )
                return;
            clearTimeout(closeTimeoutRef.current);
            tapPinnedRef.current = false;
            setShowTooltip(false);
        };
        const dismissOnEscape = (event: globalThis.KeyboardEvent) => {
            if (event.key !== "Escape") return;
            tapPinnedRef.current = false;
            setShowTooltip(false);
        };
        const dismissOnViewportChange = () => {
            tapPinnedRef.current = false;
            setShowTooltip(false);
        };

        document.addEventListener("pointerdown", dismissOnOutsideTap);
        document.addEventListener("keydown", dismissOnEscape);
        window.addEventListener("scroll", dismissOnViewportChange, {
            capture: true,
            passive: true,
        });
        window.addEventListener("resize", dismissOnViewportChange);
        return () => {
            document.removeEventListener("pointerdown", dismissOnOutsideTap);
            document.removeEventListener("keydown", dismissOnEscape);
            window.removeEventListener("scroll", dismissOnViewportChange, true);
            window.removeEventListener("resize", dismissOnViewportChange);
        };
    }, [showTooltip]);

    useLayoutEffect(() => {
        if (showTooltip && triggerRef.current && popupRef.current) {
            setTooltipPosition(
                getTooltipPosition(
                    triggerRef.current.getBoundingClientRect(),
                    popupRef.current.getBoundingClientRect(),
                    { width: window.innerWidth, height: window.innerHeight },
                    align,
                    clampToViewport,
                ),
            );
        }
    }, [showTooltip, align, clampToViewport, maxWidth, content]);

    // Informational triggers use help; action wrappers can override the cursor.
    // Only real controls get the expanded tap area; on a plain span wrapper it
    // would cover the interactive child (e.g. IconButton) on mobile.
    const isControl = triggerAs === "button" || tapEnabled;
    const triggerClassName = cn(
        isControl && "polli-control",
        "polli:relative polli:cursor-help polli:text-left polli:inline-flex polli:items-center",
        className,
    );

    const cursorClass = displayContents
        ? "polli:contents"
        : "polli:cursor-inherit";
    const descriptionId = content && showTooltip ? tooltipId : undefined;
    // Span wrappers around actions must describe the action itself. Custom
    // children must forward aria-describedby to their underlying control.
    const describeChild =
        !isControl &&
        isValidElement<{ "aria-describedby"?: string }>(children) &&
        children.type !== Fragment;
    const describedChildren =
        describeChild && descriptionId
            ? cloneElement(children, {
                  "aria-describedby": [
                      children.props["aria-describedby"],
                      descriptionId,
                  ]
                      .filter(Boolean)
                      .join(" "),
              })
            : children;

    // Portal past the trigger's layout; stay inside modal dialogs so the popup
    // shares their stacking and accessible subtree.
    const popupClasses =
        "polli:fixed polli:box-border polli:w-max polli:px-2 polli:py-1 polli:bg-surface-menu polli:text-theme-text-base polli:font-normal polli:leading-snug polli:tracking-normal polli:normal-case polli:not-italic polli:text-xs polli:rounded-md polli:shadow-md polli:z-[130] polli:transition-opacity polli:whitespace-pre-line polli:break-words";

    const popupNode = content ? (
        <span
            ref={popupRef}
            id={tooltipId}
            role="tooltip"
            aria-hidden={!showTooltip}
            style={{
                top: tooltipPosition.top,
                left: tooltipPosition.left,
                maxWidth: `min(${maxWidth}px, calc(100vw - ${TOOLTIP_VIEWPORT_MARGIN * 2}px))`,
            }}
            onMouseEnter={openTooltip}
            onMouseLeave={scheduleCloseTooltip}
            onClick={(event) => event.stopPropagation()}
            className={`${
                showTooltip
                    ? "polli:visible polli:opacity-100"
                    : "polli:invisible polli:opacity-0"
            } ${popupClasses}`}
        >
            {content}
        </span>
    ) : null;
    const tooltipPopup =
        popupNode && typeof document !== "undefined"
            ? createPortal(
                  popupNode,
                  triggerRef.current?.closest('[role="dialog"]') ??
                      document.body,
              )
            : popupNode;
    const contentNode = (
        <>
            <span className={cursorClass}>{describedChildren}</span>
            {tooltipPopup}
        </>
    );

    const sharedProps = {
        "aria-label": ariaLabel,
        "aria-describedby": describeChild ? undefined : descriptionId,
        className: triggerClassName,
        onMouseEnter: openTooltip,
        onMouseLeave: scheduleCloseTooltip,
        onClick: (e: MouseEvent) => {
            if (stopClickPropagation) e.stopPropagation();
            if (onClick) {
                onClick();
            }
            if (!tapEnabled || !content) return;
            if (tapPinnedRef.current) {
                closeTooltip();
                return;
            }
            tapPinnedRef.current = true;
            openTooltip();
        },
        onFocus: openTooltip,
        onBlur: () => {
            tapPinnedRef.current = false;
            scheduleCloseTooltip();
        },
        style,
    };

    if (triggerAs === "span") {
        const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
            if (!tapEnabled || !content) return;
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (tapPinnedRef.current) {
                closeTooltip();
                return;
            }
            tapPinnedRef.current = true;
            openTooltip();
        };
        const spanInteractionProps = {
            ...sharedProps,
            role: tapEnabled && content ? "button" : undefined,
            tabIndex: tapEnabled && content ? 0 : undefined,
            onKeyDown: tapEnabled && content ? handleKeyDown : undefined,
        };

        return (
            <span
                ref={(node) => {
                    triggerRef.current = node;
                }}
                {...spanInteractionProps}
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
            aria-describedby={content && showTooltip ? tooltipId : undefined}
            className={triggerClassName}
            onMouseEnter={sharedProps.onMouseEnter}
            onMouseLeave={sharedProps.onMouseLeave}
            onClick={sharedProps.onClick}
            onFocus={sharedProps.onFocus}
            onBlur={sharedProps.onBlur}
            style={style}
        >
            {contentNode}
        </button>
    );
};
