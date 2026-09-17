import type { CSSProperties, ReactNode } from "react";
import logoUrl from "../../brand/mark.svg";
import { cn } from "../../lib/cn.ts";
import {
    Dialog,
    DialogBody,
    DialogFooter,
    type DialogProps,
} from "../../primitives/Dialog.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { CheckIcon } from "../../primitives/icons/index.tsx";
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
    size,
}: {
    children: ReactNode;
    headerAction?: ReactNode;
    actions?: ReactNode;
    dialog?: AuthModalProps["dialog"];
    size?: DialogProps["size"];
}) {
    return (
        <AuthModal dialog={dialog} size={size}>
            <AuthModalHeader>{headerAction}</AuthModalHeader>
            <DialogBody>{children}</DialogBody>
            <div className="polli:shrink-0 polli:bg-theme-bg-pale polli:pb-5">
                {actions && <DialogFooter>{actions}</DialogFooter>}
                <div className="polli:flex polli:flex-wrap polli:justify-center polli:gap-x-4 polli:gap-y-2 polli:px-6">
                    <InlineLink
                        href="https://pollinations.ai/terms"
                        external
                        className="polli:font-body polli:text-xs"
                    >
                        Terms &amp; Conditions
                    </InlineLink>
                    <InlineLink
                        href="https://pollinations.ai/privacy"
                        external
                        className="polli:font-body polli:text-xs"
                    >
                        Privacy Policy
                    </InlineLink>
                </div>
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
            className="polli:block polli:shrink-0 polli:text-theme-text-strong polli:focus-visible:outline-2 polli:focus-visible:outline-offset-4"
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
    return (
        <div className="polli:shrink-0 polli:p-6 polli:pb-4">
            <div className="polli:flex polli:items-center polli:justify-between polli:gap-3">
                {logo}
                {children}
            </div>
        </div>
    );
}

export function AuthModalLoading() {
    return (
        <AuthFlowLayout dialog={{ label: "Loading" }}>
            <output className="polli:block polli:text-theme-text-muted">
                Loading…
            </output>
        </AuthFlowLayout>
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

export function AuthInfoCard({ title, children }: AuthInfoCardProps) {
    return (
        <Surface>
            {title != null && (
                <p className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                    {title}
                </p>
            )}
            {children}
        </Surface>
    );
}

/** A consent row with an optional checkbox and expandable details. */
export function AuthAccessItem({
    children,
    control,
    details,
    checked = false,
    onChange,
    ariaLabel,
    disabled = false,
}: {
    children: ReactNode;
    control?: ReactNode;
    details?: ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    ariaLabel?: string;
    disabled?: boolean;
}) {
    return (
        <li>
            <label
                className={cn(
                    "polli:flex polli:min-h-9 polli:items-center polli:gap-3",
                    onChange &&
                        (disabled
                            ? "polli:cursor-not-allowed"
                            : "polli:cursor-pointer"),
                )}
            >
                <span className="polli:relative polli:flex polli:h-5 polli:w-5 polli:shrink-0">
                    <input
                        type="checkbox"
                        aria-label={ariaLabel}
                        checked={checked}
                        disabled={disabled || !onChange}
                        onChange={(event) => onChange?.(event.target.checked)}
                        className="polli:peer polli:sr-only"
                    />
                    <span
                        aria-hidden="true"
                        className="polli:flex polli:h-5 polli:w-5 polli:items-center polli:justify-center polli:rounded polli:border polli:border-theme-text-muted/50 polli:bg-transparent polli:transition-colors polli:peer-checked:border-theme-bg-active polli:peer-checked:bg-theme-bg-active polli:peer-checked:text-theme-text-strong polli:peer-focus-visible:outline-2 polli:peer-focus-visible:outline-offset-2 polli:peer-focus-visible:outline-theme-text-soft polli:peer-disabled:opacity-50"
                    >
                        {checked && (
                            <CheckIcon className="polli:h-3.5 polli:w-3.5" />
                        )}
                    </span>
                </span>
                <span
                    className={cn(
                        "polli:min-w-0 polli:flex-1 polli:transition-opacity",
                        !!onChange && !checked && "polli:opacity-60",
                    )}
                >
                    {children}
                </span>
                {control != null && (
                    <span className="polli:shrink-0">{control}</span>
                )}
            </label>
            {details && <div className="polli:pt-3">{details}</div>}
        </li>
    );
}
