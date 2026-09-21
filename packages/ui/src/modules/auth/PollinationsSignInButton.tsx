import type { ComponentPropsWithoutRef } from "react";
import logoUrl from "../../brand/lockup-horizontal.svg";
import { cn } from "../../lib/cn.ts";

export type PollinationsSignInButtonProps = Omit<
    ComponentPropsWithoutRef<"button">,
    "children"
>;

/** Provider identity button; the app supplies its own sign-in action. */
export function PollinationsSignInButton({
    className,
    type = "button",
    ...props
}: PollinationsSignInButtonProps) {
    return (
        <button
            type={type}
            aria-label="Sign in with Pollinations"
            {...props}
            data-theme="accent"
            className={cn(
                "polli-control polli:inline-flex polli:min-h-12 polli:items-center polli:justify-center polli:rounded-md polli:border polli:border-theme-text-soft polli:bg-surface-white polli:[.dark_&]:bg-transparent polli:px-6 polli:py-3 polli:text-theme-text-soft polli:cursor-pointer polli:transition-colors polli:hover:bg-theme-text-soft/10 polli:[.dark_&]:hover:bg-theme-text-soft/10 polli:disabled:cursor-not-allowed polli:disabled:opacity-50",
                className,
            )}
        >
            <span
                aria-hidden="true"
                className="polli:block polli:h-6 polli:w-48 polli:max-w-full polli:bg-current"
                style={{
                    mask: `url('${logoUrl}') center / contain no-repeat`,
                    WebkitMask: `url('${logoUrl}') center / contain no-repeat`,
                }}
            />
        </button>
    );
}
