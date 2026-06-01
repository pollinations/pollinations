import {
    type ComponentPropsWithoutRef,
    forwardRef,
    type MutableRefObject,
    type PropsWithChildren,
    type Ref,
    useCallback,
    useEffect,
    useRef,
} from "react";
import { cn } from "../lib/cn.ts";
import type { ThemeName } from "../theme.ts";

type ScrollAxis = "y" | "x";

const axisClasses: Record<ScrollAxis, string> = {
    y: "polli:overflow-y-auto polli:overflow-x-hidden",
    x: "polli:overflow-x-auto polli:overflow-y-hidden",
};

type ScrollAreaOwnProps = {
    /** Override the ambient cascade theme for this scroller's thumb. */
    theme?: ThemeName;
    /** Scroll direction. Default `y`. */
    axis?: ScrollAxis;
    className?: string;
};

export type ScrollAreaProps = PropsWithChildren<
    ScrollAreaOwnProps &
        Omit<ComponentPropsWithoutRef<"div">, keyof ScrollAreaOwnProps>
>;

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
    if (typeof ref === "function") ref(value);
    else if (ref) (ref as MutableRefObject<T | null>).current = value;
}

/**
 * Themed auto-hide scroll container. Thumb color follows the nearest
 * `[data-theme="..."]` ancestor; pass `theme` to override locally.
 */
export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
    ({ theme, axis = "y", className, children, ...rest }, externalRef) => {
        const innerRef = useRef<HTMLDivElement | null>(null);

        const setRef = useCallback(
            (node: HTMLDivElement | null) => {
                innerRef.current = node;
                assignRef(externalRef, node);
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
                hideTimer = window.setTimeout(hide, 2000);
            };

            const handleInteraction = () => {
                show();
                scheduleHide();
            };

            hide();

            element.addEventListener("scroll", handleInteraction, {
                passive: true,
            });
            element.addEventListener("wheel", handleInteraction, {
                passive: true,
            });
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
        }, []);

        return (
            <div
                {...rest}
                ref={setRef}
                data-theme={theme}
                className={cn(
                    "polli-scrollbar-subtle",
                    axisClasses[axis],
                    className,
                )}
            >
                {children}
            </div>
        );
    },
);

ScrollArea.displayName = "ScrollArea";
