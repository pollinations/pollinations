import { forwardRef } from "react";
import { cn } from "../../../util.ts";

type InputProps = React.ComponentPropsWithoutRef<"input"> & {
    error?: boolean;
};

export const Input = forwardRef<HTMLInputElement, InputProps>(
    ({ className, error, ...props }, ref) => (
        <input
            ref={ref}
            className={cn(
                "px-3 py-2 border rounded-lg",
                "focus:outline-none focus:ring-2 focus:ring-green-600",
                "disabled:opacity-50 disabled:cursor-not-allowed",
                error ? "border-red-400" : "border-gray-300",
                className,
            )}
            {...props}
        />
    ),
);
