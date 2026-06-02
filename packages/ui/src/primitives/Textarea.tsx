import { forwardRef } from "react";
import { cn } from "../lib/cn.ts";

export type TextareaProps = React.ComponentPropsWithoutRef<"textarea"> & {
    error?: boolean;
};

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
    ({ className, error, rows = 4, ...props }, ref) => (
        <textarea
            ref={ref}
            rows={rows}
            className={cn(
                "polli:w-full polli:rounded-lg polli:border polli:px-3 polli:py-2",
                "polli:min-h-20 polli:resize-y polli:font-body polli:text-base",
                "polli:disabled:opacity-50 polli:disabled:cursor-not-allowed",
                error ? "polli:border-red-400" : "polli:border-gray-300",
                className,
            )}
            {...props}
        />
    ),
);

Textarea.displayName = "Textarea";
