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
            className={cn(
                "polli-control polli:inline-flex polli:min-h-11 polli:grow polli:shrink-0 polli:self-stretch polli:items-center polli:justify-center polli:gap-3 polli:whitespace-nowrap polli:rounded-md polli:px-4 polli:py-2 polli:text-sm polli:font-medium polli:disabled:cursor-not-allowed polli:disabled:opacity-50",
                className,
            )}
        >
            {icon}
            <span>{children}</span>
        </Button>
    );
}
