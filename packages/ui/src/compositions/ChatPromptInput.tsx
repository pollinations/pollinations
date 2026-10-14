import {
    type ComponentPropsWithoutRef,
    forwardRef,
    type ReactNode,
} from "react";
import { cn } from "../lib/cn.ts";
import { Textarea, type TextareaProps } from "../primitives/Textarea.tsx";

export type ChatPromptInputProps = ComponentPropsWithoutRef<"fieldset">;

/**
 * Composable prompt shell. Put attachments or controls before the textarea and
 * actions in ChatPromptInputFooter; submission stays owned by the parent form.
 */
export function ChatPromptInput({ className, ...props }: ChatPromptInputProps) {
    return (
        <fieldset
            className={cn("polli:m-0 polli:min-w-0 polli:p-0", className)}
            {...props}
        />
    );
}

export const ChatPromptTextarea = forwardRef<
    HTMLTextAreaElement,
    TextareaProps
>(({ className, ...props }, ref) => (
    <Textarea
        {...props}
        ref={ref}
        className={cn("polli:resize-none", className)}
    />
));

ChatPromptTextarea.displayName = "ChatPromptTextarea";

export type ChatPromptInputFooterProps = ComponentPropsWithoutRef<"div"> & {
    start?: ReactNode;
    end?: ReactNode;
};

export function ChatPromptInputFooter({
    start,
    end,
    children,
    className,
    ...props
}: ChatPromptInputFooterProps) {
    return (
        <div
            className={cn(
                "polli:flex polli:flex-wrap polli:items-end polli:gap-2",
                className,
            )}
            {...props}
        >
            {children ?? (
                <>
                    <div className="polli:flex polli:flex-wrap polli:items-center polli:gap-2">
                        {start}
                    </div>
                    <div className="polli:ml-auto polli:flex polli:items-center polli:gap-2">
                        {end}
                    </div>
                </>
            )}
        </div>
    );
}
