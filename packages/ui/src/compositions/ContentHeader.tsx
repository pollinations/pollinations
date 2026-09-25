import type { ReactNode } from "react";
import { cn } from "../lib/cn.ts";
import { Eyebrow } from "../primitives/Eyebrow.tsx";

export type ContentHeaderProps = {
    eyebrow: ReactNode;
    title: ReactNode;
    subtitle?: ReactNode;
    action?: ReactNode;
    variant?: "page" | "section";
    className?: string;
};

const titleClasses = {
    page: "polli:font-heading polli:text-4xl polli:leading-[1.08] polli:text-theme-text-strong polli:sm:text-5xl polli:lg:text-7xl",
    section:
        "polli:font-subheading polli:text-3xl polli:leading-tight polli:text-theme-text-strong polli:sm:text-4xl",
} as const;

const subtitleClasses = {
    page: "polli:max-w-lg polli:text-base polli:leading-relaxed polli:text-theme-text-base polli:sm:text-lg",
    section: "polli:max-w-xl polli:leading-relaxed polli:text-theme-text-base",
} as const;

/** Shared page/section heading rhythm with an optional trailing action. */
export function ContentHeader({
    eyebrow,
    title,
    subtitle,
    action,
    variant = "section",
    className,
}: ContentHeaderProps) {
    const Title = variant === "page" ? "h1" : "h2";

    return (
        <header
            className={cn(
                "polli:flex polli:flex-wrap polli:items-end polli:justify-between polli:gap-6",
                className,
            )}
        >
            <div className="polli:flex polli:max-w-2xl polli:flex-col polli:gap-3">
                <Eyebrow size="page">{eyebrow}</Eyebrow>
                <Title className={titleClasses[variant]}>{title}</Title>
                {subtitle && (
                    <p
                        className={cn(
                            subtitleClasses[variant],
                            "polli:[&_strong]:text-theme-text-strong",
                        )}
                    >
                        {subtitle}
                    </p>
                )}
            </div>
            {action}
        </header>
    );
}
