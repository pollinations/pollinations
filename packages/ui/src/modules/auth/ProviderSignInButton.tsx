import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Button, type ButtonProps } from "../../primitives/Button.tsx";

/** Shared geometry and branding for the provider sign-in controls. */
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
            data-theme="accent"
            className={cn(
                "polli-control polli:inline-flex polli:h-12 polli:w-full polli:shrink-0 polli:whitespace-nowrap polli:items-center polli:justify-center polli:gap-3 polli:rounded-md polli:border polli:border-theme-text-soft polli:bg-surface-white polli:[.dark_&]:bg-transparent polli:px-4 polli:py-3 polli:text-sm polli:font-medium polli:text-theme-text-strong polli:cursor-pointer polli:transition-colors polli:hover:bg-theme-text-soft/10 polli:disabled:cursor-not-allowed polli:disabled:opacity-50",
                className,
            )}
        >
            {icon}
            <span>{children}</span>
        </Button>
    );
}
