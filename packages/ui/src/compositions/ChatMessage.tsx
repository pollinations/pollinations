import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { RobotIcon } from "../primitives/icons/index.tsx";
import { Text } from "../primitives/Typography.tsx";

export type ChatMessageRole = "user" | "assistant" | "system";

export type ChatMessageProps = ComponentPropsWithoutRef<"article"> & {
    from: ChatMessageRole;
};

/** Protocol-neutral message surface inspired by AI Elements' Message suite. */
export function ChatMessage({
    from,
    className,
    children,
    ...props
}: ChatMessageProps) {
    return (
        <article
            data-role={from}
            className={cn(
                "polli:group/message polli:flex polli:w-fit polli:max-w-full polli:min-w-0 polli:flex-col polli:gap-3 polli:[overflow-wrap:anywhere] polli:rounded-xl polli:px-4 polli:py-3",
                from === "user"
                    ? "polli:ml-auto polli:bg-theme-bg-active polli:text-theme-text-strong"
                    : "polli:mr-auto polli:bg-surface-opaque polli:text-theme-text-base polli:shadow-well",
                className,
            )}
            {...props}
        >
            {children}
        </article>
    );
}

export type ChatMessageHeaderProps = ComponentPropsWithoutRef<"header"> & {
    from: ChatMessageRole;
    label?: ReactNode;
    icon?: ReactNode;
};

export function ChatMessageHeader({
    from,
    label,
    icon,
    className,
    ...props
}: ChatMessageHeaderProps) {
    const content =
        label ??
        (from === "user" ? "You" : from === "assistant" ? "Agent" : "System");
    return (
        <header
            className={cn(
                "polli:flex polli:items-center polli:gap-2",
                className,
            )}
            {...props}
        >
            {from === "assistant" &&
                (icon ?? (
                    <span className="polli:flex polli:size-6 polli:items-center polli:justify-center polli:rounded-full polli:bg-theme-bg-active polli:text-theme-text-strong">
                        <RobotIcon className="polli:size-3.5" />
                    </span>
                ))}
            <Text
                as="span"
                size="xs"
                tone="muted"
                weight="bold"
                className="polli:uppercase polli:tracking-wide"
            >
                {content}
            </Text>
        </header>
    );
}

export type ChatMessageContentProps = ComponentPropsWithoutRef<"div">;

export function ChatMessageContent({
    className,
    ...props
}: ChatMessageContentProps) {
    return (
        <div
            className={cn(
                "polli:min-w-0 polli:[&_pre]:max-w-full polli:[&_pre]:overflow-x-auto polli:[&_table]:max-w-full polli:[&_table]:overflow-x-auto",
                className,
            )}
            {...props}
        />
    );
}

export type ChatMessageActionsProps = ComponentPropsWithoutRef<"footer">;

export function ChatMessageActions({
    className,
    ...props
}: ChatMessageActionsProps) {
    return (
        <footer
            className={cn(
                "polli:flex polli:flex-wrap polli:items-center polli:gap-1 polli:pt-2",
                className,
            )}
            {...props}
        />
    );
}
