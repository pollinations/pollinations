import { cn } from "@frontend/lib/cn.ts";
import {
    type ComponentPropsWithoutRef,
    type FC,
    type PropsWithChildren,
    type Ref,
    useCallback,
    useEffect,
    useRef,
} from "react";
import type { ThemeName } from "../layout/dashboard-theme.ts";

type ScrollAxis = "y" | "x" | "both";

const axisClasses: Record<ScrollAxis, string> = {
    y: "overflow-y-auto overflow-x-hidden",
    x: "overflow-x-auto overflow-y-hidden",
    both: "overflow-auto",
};

type ScrollAreaOwnProps = {
    /** Override the ambient cascade theme for this scroller's thumb. */
    theme?: ThemeName;
    /** Scroll direction. Default `y`. */
    axis?: ScrollAxis;
    /** Idle time before the thumb fades out, in ms. Default `2000`. */
    hideDelayMs?: number;
    /** Forwarded ref onto the scrolling viewport element. */
    ref?: Ref<HTMLDivElement>;
    className?: string;
};

type ScrollAreaProps = PropsWithChildren<
    ScrollAreaOwnProps &
        Omit<ComponentPropsWithoutRef<"div">, keyof ScrollAreaOwnProps>
>;

/**
 * Themed auto-hide scroll container. Thumb color follows the nearest
 * `[data-theme="…"]` ancestor; pass `theme` to override locally. The
 * thumb is invisible at rest and fades in on scroll / pointer / keyboard
 * interaction, then fades out after `hideDelayMs` of idle.
 *
 * Pair with `min-h-0 flex-1` (or a max-height) on the wrapper to give
 * it a bounded scroll viewport.
 */
export const ScrollArea: FC<ScrollAreaProps> = ({
    theme,
    axis = "y",
    hideDelayMs = 2000,
    ref: externalRef,
    className,
    children,
    ...rest
}) => {
    const innerRef = useRef<HTMLDivElement | null>(null);

    const setRef = useCallback(
        (node: HTMLDivElement | null) => {
            innerRef.current = node;
            if (typeof externalRef === "function") externalRef(node);
            else if (externalRef) externalRef.current = node;
        },
        [externalRef],
    );

    useEffect(() => {
        const element = innerRef.current;
        if (!element) return;

        let hideTimer: number | null = null;

        const clearHideTimer = () => {
            if (hideTimer !== null) {
                window.clearTimeout(hideTimer);
                hideTimer = null;
            }
        };

        const show = () => {
            element.dataset.scrollbarActive = "true";
            clearHideTimer();
        };

        const hide = () => {
            element.dataset.scrollbarActive = "false";
            clearHideTimer();
        };

        const scheduleHide = () => {
            clearHideTimer();
            hideTimer = window.setTimeout(hide, hideDelayMs);
        };

        const handleInteraction = () => {
            show();
            scheduleHide();
        };

        hide();

        element.addEventListener("scroll", handleInteraction, {
            passive: true,
        });
        element.addEventListener("wheel", handleInteraction, { passive: true });
        element.addEventListener("touchstart", handleInteraction, {
            passive: true,
        });
        element.addEventListener("pointerdown", handleInteraction);
        element.addEventListener("keydown", handleInteraction);
        element.addEventListener("focusin", handleInteraction);
        element.addEventListener("focusout", scheduleHide);

        return () => {
            clearHideTimer();
            element.removeEventListener("scroll", handleInteraction);
            element.removeEventListener("wheel", handleInteraction);
            element.removeEventListener("touchstart", handleInteraction);
            element.removeEventListener("pointerdown", handleInteraction);
            element.removeEventListener("keydown", handleInteraction);
            element.removeEventListener("focusin", handleInteraction);
            element.removeEventListener("focusout", scheduleHide);
        };
    }, [hideDelayMs]);

    return (
        <div
            {...rest}
            ref={setRef}
            data-theme={theme}
            className={cn("scrollbar-subtle", axisClasses[axis], className)}
        >
            {children}
        </div>
    );
};
