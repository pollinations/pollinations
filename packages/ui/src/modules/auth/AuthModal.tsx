import type { ReactNode } from "react";
import { Dialog } from "../../primitives/Dialog.tsx";

export type AuthModalProps = {
    children: ReactNode;
    dialog?: {
        label?: string;
        labelledBy?: string;
    };
    tone?: "default" | "error";
};

export function AuthModal({
    children,
    dialog,
    tone = "default",
}: AuthModalProps) {
    const borderClass =
        tone === "error"
            ? "polli:border-intent-danger-border"
            : "polli:border-theme-border";
    return (
        <Dialog
            open
            theme="amber"
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            positionerClassName="polli:items-start polli:overflow-y-auto polli:bg-theme-bg-pale"
            contentClassName={`polli:bg-surface-white polli:border-2 ${borderClass} polli:rounded-lg polli:shadow-lg polli:max-w-xl polli:w-full polli:my-auto`}
        >
            {children}
        </Dialog>
    );
}

export type AuthModalHeaderProps = {
    children?: ReactNode;
};

export function AuthModalHeader({ children }: AuthModalHeaderProps) {
    const logo = (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="polli:shrink-0"
        >
            <img
                src="/logo.svg"
                alt="pollinations.ai"
                className="polli:h-8 polli:w-8 polli:object-contain polli:invert"
            />
        </a>
    );
    if (!children) {
        return (
            <div className="polli:flex polli:justify-start polli:px-6 polli:pt-6">
                {logo}
            </div>
        );
    }
    return (
        <div className="polli:px-6 polli:pt-6 polli:pb-2">
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                {logo}
                {children}
            </div>
        </div>
    );
}

export function AuthModalLoading() {
    return (
        <AuthModal>
            <AuthModalHeader />
            <div className="polli:px-8 polli:pt-2 polli:pb-8 polli:text-center">
                <p className="polli:text-theme-text-strong">Loading...</p>
            </div>
        </AuthModal>
    );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
    return (
        <div className="polli:rounded-lg polli:border-2 polli:border-intent-danger-border polli:bg-intent-danger-bg-light polli:p-4">
            <p className="polli:text-sm polli:text-intent-danger-text">
                {children}
            </p>
        </div>
    );
}

export type AuthInfoCardProps = {
    title?: string;
    titleId?: string;
    children: ReactNode;
};

export function AuthInfoCard({
    title = "Authorize",
    titleId,
    children,
}: AuthInfoCardProps) {
    return (
        <div className="polli:rounded-lg polli:border-2 polli:border-theme-border polli:bg-theme-bg-pale polli:p-4">
            <p
                id={titleId}
                className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft"
            >
                {title}
            </p>
            {children}
        </div>
    );
}
