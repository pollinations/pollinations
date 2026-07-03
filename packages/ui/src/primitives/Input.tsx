import { forwardRef } from "react";
import { cn } from "../lib/cn.ts";

export type InputProps = React.ComponentPropsWithoutRef<"input"> & {
    error?: boolean;
    hideNumberSteppers?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, hideNumberSteppers, ...props }, ref) => (
        <input
            ref={ref}
            data-error={error ? "true" : undefined}
            className={cn(
                "polli-input polli:px-3 polli:py-2 polli:border polli:rounded-lg",
                "polli:text-theme-text-strong",
                "polli:transition-colors",
                "polli:disabled:opacity-50 polli:disabled:cursor-not-allowed",
                hideNumberSteppers && "polli-input-number-clean",
                className,
            )}
            {...props}
        />
    ),
);
