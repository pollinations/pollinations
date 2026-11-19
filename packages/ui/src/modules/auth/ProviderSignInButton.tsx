import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import { Button, type ButtonProps } from "../../primitives/Button.tsx";

/** Shared geometry for provider sign-in controls; busy shows Polli. */
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
                    className="polli:relative polli:h-5 polli:w-5 polli:shrink-0"
                >
                    <span className="polli-bee" />
                </span>
            ) : (
                icon
            )}
            <span>{children}</span>
        </Button>
    );
}
