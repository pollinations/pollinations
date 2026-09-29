import type { CSSProperties } from "react";
import markUrl from "../brand/mark.svg";
import { cn } from "../lib/cn.ts";

export type AppBrandProps = {
    appName: string;
    href?: string;
    size?: "md" | "sm";
    className?: string;
};

const markMask: CSSProperties = {
    WebkitMask: `url('${markUrl}') center / contain no-repeat`,
    mask: `url('${markUrl}') center / contain no-repeat`,
};

/** Lotus mark + app name: the one brand every internal app shows. */
export function AppBrand({
    appName,
    href = "/",
    size = "md",
    className,
}: AppBrandProps) {
    return (
        <a
            href={href}
            className={cn(
                "polli:inline-flex polli:min-w-0 polli:shrink-0 polli:items-center polli:text-theme-text-strong",
                size === "md" ? "polli:gap-3" : "polli:gap-2.5",
                className,
            )}
        >
            <span
                aria-hidden="true"
                className={cn(
                    "polli:block polli:shrink-0 polli:bg-current",
                    size === "md"
                        ? "polli:h-8 polli:w-8"
                        : "polli:h-7 polli:w-7",
                )}
                style={markMask}
            />
            <span
                className={cn(
                    "polli:min-w-0 polli:truncate polli:font-subheading polli:font-medium polli:leading-none",
                    size === "md" ? "polli:text-2xl" : "polli:text-xl",
                )}
            >
                {appName}
            </span>
        </a>
    );
}
