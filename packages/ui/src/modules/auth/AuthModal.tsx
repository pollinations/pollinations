import type { CSSProperties, ReactNode } from "react";
import logoUrl from "../../assets/logo.svg";
import { Dialog } from "../../primitives/Dialog.tsx";

const authLogoMaskUrl = `url('${logoUrl}')`;

const authLogoMask: CSSProperties = {
    WebkitMaskImage: authLogoMaskUrl,
    WebkitMaskPosition: "center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskImage: authLogoMaskUrl,
    maskPosition: "center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
};

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
            className="polli:block polli:shrink-0 polli:text-theme-text-strong polli:focus:outline-none polli:focus-visible:outline-none"
            aria-label="pollinations.ai"
        >
            <span className="polli:sr-only">pollinations.ai</span>
            <span
                aria-hidden="true"
                className="polli:block polli:h-8 polli:w-8 polli:bg-current"
                style={authLogoMask}
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
    children: ReactNode;
};

export function AuthInfoCard({
    title = "Authorize",
    children,
}: AuthInfoCardProps) {
    return (
        <div className="polli:rounded-lg polli:border-2 polli:border-theme-border polli:bg-theme-bg-pale polli:p-4">
            <p className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                {title}
            </p>
            {children}
        </div>
    );
}
