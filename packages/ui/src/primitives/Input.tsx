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
            className={cn(
                "polli:px-3 polli:py-2 polli:border polli:rounded-lg",
                "polli:disabled:opacity-50 polli:disabled:cursor-not-allowed",
                error ? "polli:border-red-400" : "polli:border-gray-300",
                hideNumberSteppers && "polli-input-number-clean",
                className,
            )}
            {...props}
        />
    ),
);
