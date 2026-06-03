import type { ReactNode } from "react";
import { cn } from "../../lib/cn.ts";
import type { ThemeName } from "../../theme.ts";

export type HeaderFrameProps = {
    left: ReactNode;
    center?: ReactNode;
    right?: ReactNode;
    theme?: ThemeName;
    width?: "5xl" | "6xl";
    className?: string;
    innerClassName?: string;
};

const widthClasses = {
    "5xl": "polli:max-w-5xl",
    "6xl": "polli:max-w-6xl",
} as const;

export function HeaderFrame({
    left,
    center,
    right,
    theme,
    width = "6xl",
    className,
    innerClassName,
}: HeaderFrameProps) {
    return (
        <header
            data-theme={theme}
            className={cn(
                "polli:border-b polli:border-gray-200 polli:bg-white",
                className,
            )}
        >
            <div
                className={cn(
                    "polli:mx-auto polli:flex polli:h-14 polli:w-full polli:items-center polli:justify-between polli:gap-4 polli:px-4 sm:polli:px-6",
                    widthClasses[width],
                    innerClassName,
                )}
            >
                <div className="polli:flex polli:min-w-0 polli:items-center">
                    {left}
                </div>
                {center && (
                    <div className="polli:flex polli:min-w-0 polli:flex-1 polli:items-center polli:justify-center">
                        {center}
                    </div>
                )}
                {right && (
                    <div className="polli:flex polli:shrink-0 polli:items-center">
                        {right}
                    </div>
                )}
            </div>
        </header>
    );
}
