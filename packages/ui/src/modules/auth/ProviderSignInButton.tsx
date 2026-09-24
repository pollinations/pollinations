import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Button, type ButtonProps } from "../../primitives/Button.tsx";

/** Shared geometry for provider sign-in controls. */
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
            {icon}
            <span>{children}</span>
        </Button>
    );
}
