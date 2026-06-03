import wordmarkUrl from "../assets/logo-wordmark.svg";
import { cn } from "../lib/cn.ts";

export type PollinationsLogoProps = {
    className?: string;
    markClassName?: string;
    label?: string;
};

export function PollinationsLogo({
    className,
    markClassName,
    label = "pollinations.ai",
}: PollinationsLogoProps) {
    return (
        <span className={cn("polli:inline-flex polli:items-center", className)}>
            <img
                src={wordmarkUrl}
                alt={label}
                className={cn(
                    "polli:block polli:h-5 polli:w-44 polli:object-contain polli:object-left",
                    markClassName,
                )}
            />
        </span>
    );
}
