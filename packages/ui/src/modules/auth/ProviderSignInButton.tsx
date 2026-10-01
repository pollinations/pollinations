import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Button, type ButtonProps } from "../../primitives/Button.tsx";

/** Shared geometry for provider sign-in controls; busy shows a spinner. */
export function ProviderSignInButton({
    icon,
    className,
    children,
    type = "button",
    ...props
}: Omit<ButtonProps<"button">, "as"> & { icon: ReactNode }) {
    return (
        <Button
            {...props}
            type={type}
            intent="brand"
            data-theme="accent"
            className={cn("polli:gap-2 polli:whitespace-nowrap", className)}
        >
            {props["aria-busy"] === true ? (
                <span
                    aria-hidden="true"
                    className="polli:h-5 polli:w-5 polli:shrink-0 polli:animate-spin polli:rounded-full polli:border-2 polli:border-current polli:border-r-transparent polli:motion-reduce:animate-none"
                />
            ) : (
                icon
            )}
            <span>{children}</span>
        </Button>
    );
}
