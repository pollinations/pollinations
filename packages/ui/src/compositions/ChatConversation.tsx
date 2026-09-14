import {
    type ComponentPropsWithoutRef,
    forwardRef,
    type ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";
import { ArrowRightIcon } from "../primitives/icons/index.tsx";
import { ScrollArea, type ScrollAreaProps } from "../primitives/ScrollArea.tsx";

export type ChatConversationProps = Omit<
    ScrollAreaProps,
    "children" | "className"
> & {
    children: ReactNode;
    className?: string;
    viewportClassName?: string;
    showScrollButton?: boolean;
    onScrollToBottom?: () => void;
    scrollButtonLabel?: string;
};

/**
 * Scrollable chat transcript with an optional jump-to-latest control.
 * Message data and streaming remain the consumer's responsibility.
 */
export const ChatConversation = forwardRef<
    HTMLDivElement,
    ChatConversationProps
>(
    (
        {
            children,
            className,
            viewportClassName,
            showScrollButton = false,
            onScrollToBottom,
            scrollButtonLabel = "Scroll to latest message",
            ...viewportProps
        },
        ref,
    ) => (
        <div className={cn("polli:relative polli:min-h-0", className)}>
            <ScrollArea
                {...viewportProps}
                ref={ref}
                className={cn("polli:h-full polli:min-h-0", viewportClassName)}
            >
                {children}
            </ScrollArea>
            {showScrollButton && onScrollToBottom && (
                <button
                    type="button"
                    aria-label={scrollButtonLabel}
                    title={scrollButtonLabel}
                    onClick={onScrollToBottom}
                    className="polli-control polli:absolute polli:bottom-3 polli:left-1/2 polli:flex polli:size-9 polli:-translate-x-1/2 polli:cursor-pointer polli:items-center polli:justify-center polli:rounded-full polli:border polli:border-theme-border/60 polli:bg-surface-opaque polli:text-theme-text-strong polli:shadow-well polli:transition-transform polli:hover:translate-y-0.5"
                >
                    <ArrowRightIcon className="polli:size-4 polli:rotate-90" />
                </button>
            )}
        </div>
    ),
);

ChatConversation.displayName = "ChatConversation";

export type ChatConversationContentProps = ComponentPropsWithoutRef<"div">;

export function ChatConversationContent({
    className,
    ...props
}: ChatConversationContentProps) {
    return (
        <div
            className={cn(
                "polli:flex polli:min-w-0 polli:flex-col polli:gap-5",
                className,
            )}
            {...props}
        />
    );
}
