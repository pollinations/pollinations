import { forwardRef } from "react";
import { cn } from "../lib/cn.ts";

export type InputProps = React.ComponentPropsWithoutRef<"input"> & {
    error?: boolean;
    hideNumberSteppers?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, hideNumberSteppers, onWheel, ...props }, ref) => (
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
            onWheel={(event) => {
                // A focused number input scrubs its value on wheel and eats the
                // scroll, so a wheel over one inside a dialog silently edits the
                // number and the dialog looks frozen. Drop focus first: by the
                // time the default action runs the input is no longer focused,
                // so the value is left alone and the scroll passes through.
                if (props.type === "number") event.currentTarget.blur();
                onWheel?.(event);
            }}
            {...props}
        />
    ),
);
