import type { ReactNode } from "react";

type ResourceCardHeaderProps = {
    contentClassName?: string;
    icon: ReactNode;
    title: ReactNode;
    actions: ReactNode;
    badges?: ReactNode;
    description?: string | null;
};

export function ResourceCardHeader({
    contentClassName,
    icon,
    title,
    actions,
    badges,
    description,
}: ResourceCardHeaderProps) {
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-1">
            <div className={`min-w-0 ${contentClassName ?? ""}`}>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="shrink-0 text-theme-text-muted">
                        {icon}
                    </span>
                    <span className="min-w-0 text-sm font-semibold leading-5 [overflow-wrap:anywhere]">
                        {title}
                    </span>
                    {badges}
                </div>
                {description && (
                    <p className="mt-1 text-sm text-theme-text-muted">
                        {description}
                    </p>
                )}
            </div>
            <div className="flex shrink-0 items-center gap-1">{actions}</div>
        </div>
    );
}
