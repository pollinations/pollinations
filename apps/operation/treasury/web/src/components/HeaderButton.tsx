import type { ReactNode } from "react";

type HeaderButtonTone = "neutral" | "info" | "danger" | "success";

const TONE_CLASS: Record<HeaderButtonTone, string> = {
    neutral:
        "border-theme-border/70 bg-theme-bg-active text-theme-text-strong hover:bg-theme-bg-hover",
    info: "border-theme-link/40 bg-theme-bg-active text-theme-link hover:bg-theme-bg-hover",
    danger: "border-intent-danger-text/30 bg-intent-danger-bg-light text-intent-danger-text hover:bg-intent-danger-bg-hover",
    success:
        "border-intent-success-text/30 bg-intent-success-bg-bright text-intent-success-text-on-bright hover:brightness-105",
};

export function HeaderButton({
    children,
    disabled,
    icon,
    label,
    onClick,
    title,
    tone = "neutral",
}: {
    children?: ReactNode;
    disabled?: boolean;
    icon?: ReactNode;
    label?: string;
    onClick: () => void;
    title?: string;
    tone?: HeaderButtonTone;
}) {
    return (
        <button
            type="button"
            disabled={disabled}
            onClick={onClick}
            title={title}
            aria-label={label}
            className={[
                "inline-flex h-7 items-center justify-center gap-1.5 rounded-full border px-3 pt-0.5 pb-1 text-sm font-semibold transition-colors",
                disabled ? "cursor-not-allowed opacity-70" : "cursor-pointer",
                TONE_CLASS[tone],
            ].join(" ")}
        >
            {icon}
            {children}
        </button>
    );
}
