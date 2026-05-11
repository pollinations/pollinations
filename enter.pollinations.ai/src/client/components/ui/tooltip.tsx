import {
    type CSSProperties,
    type FC,
    type MouseEvent,
    type ReactNode,
    useRef,
    useState,
} from "react";
import { cn } from "@/util.ts";

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
    const [tooltipPosition, setTooltipPosition] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLElement | null>(null);

    const updateTooltipPosition = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setTooltipPosition({
                top: rect.bottom + 4,
                left: rect.left,
            });
        }
    };

    const triggerClassName = cn(
        "relative cursor-default text-left inline-flex items-center",
        className,
    );

    const cursorClass = displayContents
        ? "contents"
        : "md:cursor-default cursor-pointer";

    const contentNode = (
        <>
            <span className={cursorClass}>{children}</span>
            <span
                style={{
                    top: tooltipPosition.top,
                    left: tooltipPosition.left,
                }}
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } hidden md:block fixed px-3 py-2 bg-white text-gray-800 text-xs rounded-lg shadow-lg border border-gray-200 z-50 pointer-events-none transition-opacity max-w-xs leading-snug`}
            >
                {content}
            </span>
            <span
                style={{ top: tooltipPosition.top }}
                className={`${
                    showTooltip ? "visible opacity-100" : "invisible opacity-0"
                } md:hidden fixed left-1/2 -translate-x-1/2 px-4 py-3 bg-white text-gray-800 text-xs rounded-lg shadow-xl border border-gray-200 z-50 pointer-events-none transition-opacity max-w-[90vw]`}
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
