import type { CSSProperties, ReactNode } from "react";
import logoUrl from "../../brand/mark.svg";
import { cn } from "../../lib/cn.ts";
import { Dialog } from "../../primitives/Dialog.tsx";
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
    contentClassName?: string;
    dialog?: {
        label?: string;
        labelledBy?: string;
    };
    tone?: "default" | "error";
};

export function AuthModal({
    children,
    contentClassName,
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
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            positionerClassName="polli:items-start polli:overflow-y-auto polli:bg-app-bg"
            contentClassName={cn(
                "polli:bg-surface-white polli:border-2 polli:rounded-lg polli:shadow-lg polli:max-w-xl polli:w-full polli:my-auto",
                borderClass,
                contentClassName,
            )}
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
    account,
    actions,
    secondaryAction,
    dialog,
}: {
    children: ReactNode;
    account?: ReactNode;
    actions: ReactNode;
    secondaryAction?: ReactNode;
    dialog?: AuthModalProps["dialog"];
}) {
    return (
        <Dialog
            open
            layout="flow"
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            positionerClassName="polli:bg-app-bg"
        >
            <ScrollArea className="polli:min-h-0 polli:flex-1 polli:overscroll-contain polli:scroll-pt-28 polli:scroll-pb-4 polli:sm:rounded-t-2xl">
                <div className="polli:flex polli:min-h-full polli:flex-col">
                    <div className="polli:sticky polli:top-0 polli:z-10 polli:shrink-0 polli:bg-surface-white/80 polli:pb-3 polli:backdrop-blur-md">
                        <AuthModalHeader>{account}</AuthModalHeader>
                    </div>
                    <div className="polli:flex-1 polli:space-y-3 polli:px-6 polli:py-2">
                        {children}
                    </div>
                </div>
            </ScrollArea>
            <AuthActionFooter
                actions={actions}
                secondaryAction={secondaryAction}
            />
        </Dialog>
    );
}

export function AuthActionButtons({
    actions,
    secondaryAction,
}: {
    actions: ReactNode;
    secondaryAction?: ReactNode;
}) {
    if (!actions && !secondaryAction) return null;
    return (
        <div className="polli:@container/auth-footer polli:w-full polli:[&_button]:rounded-md polli:[&_a]:rounded-md polli:[&_button]:font-body polli:[&_a]:font-body polli:[&_button]:text-sm polli:[&_a]:text-sm">
            <div className="polli:grid polli:w-full polli:grid-cols-1 polli:gap-3 polli:@min-[320px]/auth-footer:grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)]">
                {secondaryAction && (
                    <div
                        data-auth-slot="secondary"
                        data-theme="neutral"
                        className={cn(
                            "polli:flex polli:min-h-9 polli:items-center polli:justify-center polli:@min-[320px]/auth-footer:row-start-1 polli:[&_button]:h-9 polli:[&_a]:h-9",
                            actions
                                ? "polli:@min-[320px]/auth-footer:col-start-1"
                                : "polli:@min-[320px]/auth-footer:col-span-full",
                        )}
                    >
                        {secondaryAction}
                    </div>
                )}
                {actions && (
                    <div
                        data-auth-slot="primary"
                        data-theme="accent"
                        className={cn(
                            "polli:order-first polli:flex polli:min-h-12 polli:min-w-0 polli:w-full polli:items-center polli:justify-center polli:@min-[320px]/auth-footer:order-none polli:@min-[320px]/auth-footer:row-start-1 polli:[&_button]:h-12 polli:[&_button]:w-full polli:[&_a]:h-12 polli:[&_a]:w-full",
                            secondaryAction
                                ? "polli:@min-[320px]/auth-footer:col-start-2"
                                : "polli:@min-[320px]/auth-footer:col-span-full polli:@min-[320px]/auth-footer:w-[calc(100%_-_8.25rem)] polli:justify-self-center",
                        )}
                    >
                        {actions}
                    </div>
                )}
            </div>
        </div>
    );
}

export function AuthActionFooter({
    actions,
    secondaryAction,
}: {
    actions: ReactNode;
    secondaryAction?: ReactNode;
}) {
    return (
        <div className="polli:sticky polli:bottom-0 polli:z-10 polli:flex polli:shrink-0 polli:flex-col polli:items-center polli:gap-3 polli:bg-surface-white/80 polli:p-6 polli:pt-4 polli:backdrop-blur-md">
            <AuthActionButtons
                actions={actions}
                secondaryAction={secondaryAction}
            />
            <InlineLink
                href="https://pollinations.ai/terms"
                external
                className="polli:text-xs"
            >
                Terms &amp; Conditions
            </InlineLink>
        </div>
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
