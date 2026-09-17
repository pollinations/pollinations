import type { CSSProperties, ReactNode } from "react";
import logoUrl from "../../brand/mark.svg";
import { Dialog, type DialogProps } from "../../primitives/Dialog.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { Surface } from "../../primitives/Surface.tsx";

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
    size?: DialogProps["size"];
    onClose?: () => void;
    dialog?: {
        label?: string;
        labelledBy?: string;
    };
};

export function AuthModal({ children, size, dialog, onClose }: AuthModalProps) {
    return (
        <Dialog
            open
            onOpenChange={(open) => !open && onClose?.()}
            layout="flow"
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            positionerClassName="polli:bg-app-bg"
            size={size}
        >
            {children}
        </Dialog>
    );
}

export type AuthModalHeaderProps = {
    children?: ReactNode;
};

/** Shared sign-in chrome with stable scrolling content and actions. */
export function AuthFlowLayout({
    children,
    headerAction,
    actions,
    dialog,
}: {
    children: ReactNode;
    headerAction?: ReactNode;
    actions: ReactNode;
    dialog?: AuthModalProps["dialog"];
}) {
    return (
        <AuthModal dialog={dialog}>
            <ScrollArea className="polli:min-h-0 polli:flex-1 polli:overscroll-contain polli:scroll-pt-28 polli:scroll-pb-4 polli:sm:rounded-t-2xl">
                <div className="polli:flex polli:min-h-full polli:flex-col">
                    <div className="polli:sticky polli:top-0 polli:z-10 polli:shrink-0 polli:bg-surface-white/80 polli:pb-3 polli:backdrop-blur-md">
                        <AuthModalHeader>{headerAction}</AuthModalHeader>
                    </div>
                    <div className="polli:flex-1 polli:space-y-3 polli:px-6 polli:py-2">
                        {children}
                    </div>
                </div>
            </ScrollArea>
            <div className="polli:sticky polli:bottom-0 polli:z-10 polli:flex polli:shrink-0 polli:flex-col polli:items-center polli:gap-3 polli:bg-surface-white/80 polli:p-6 polli:pt-4 polli:backdrop-blur-md">
                <div className="polli:w-full">{actions}</div>
                <InlineLink
                    href="https://pollinations.ai/terms"
                    external
                    className="polli:font-body polli:text-xs"
                >
                    Terms &amp; Conditions
                </InlineLink>
            </div>
        </AuthModal>
    );
}

export function AuthModalHeader({ children }: AuthModalHeaderProps) {
    const logo = (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            tabIndex={-1}
            className="polli:block polli:shrink-0 polli:text-theme-text-strong polli:focus:outline-none"
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
            <div className="polli:flex polli:shrink-0 polli:justify-start polli:px-6 polli:pt-6">
                {logo}
            </div>
        );
    }
    return (
        <div className="polli:shrink-0 polli:px-6 polli:pt-6 polli:pb-2">
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
        <div
            role="alert"
            className="polli:rounded-lg polli:bg-intent-danger-bg-light polli:p-4 polli:text-sm polli:text-intent-danger-text"
        >
            {children}
        </div>
    );
}

export type AuthInfoCardProps = {
    title?: string | null;
    children: ReactNode;
};

export function AuthInfoCard({
    title = "Authorize",
    children,
}: AuthInfoCardProps) {
    return (
        <Surface variant="card-themed">
            {title != null && (
                <p className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                    {title}
                </p>
            )}
            {children}
        </Surface>
    );
}
