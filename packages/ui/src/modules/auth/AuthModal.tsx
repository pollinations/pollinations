import type { CSSProperties, ReactNode } from "react";
import { useId } from "react";
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
import { Heading, Text } from "../../primitives/Typography.tsx";

const brandMask = (url: string): CSSProperties => ({
    WebkitMaskImage: `url('${url}')`,
    WebkitMaskPosition: "left center",
    WebkitMaskRepeat: "no-repeat",
    WebkitMaskSize: "contain",
    maskImage: `url('${url}')`,
    maskPosition: "left center",
    maskRepeat: "no-repeat",
    maskSize: "contain",
});

const authMarkMask = brandMask(logoUrl);

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

export type AuthFlowLayoutProps = {
    children?: ReactNode;
    /** Screen title; rendered once with the shared recipe and labels the dialog. */
    title?: ReactNode;
    /** The subject of the sentence: the app, the device, the key. Sits between title and description. */
    subject?: ReactNode;
    /** One sentence under the title. */
    description?: ReactNode;
    /** What failed; rendered as the error line under the description. */
    error?: ReactNode;
    titleId?: string;
    headerAction?: ReactNode;
    actions?: ReactNode;
    /** One sentence under the actions; defaults to the legal notice. */
    footnote?: ReactNode;
    dialog?: AuthModalProps["dialog"];
    size?: DialogProps["size"];
};

const legalFootnote = (
    <>
        By continuing, you agree to the{" "}
        <InlineLink href="https://pollinations.ai/terms" external>
            Terms
        </InlineLink>{" "}
        and acknowledge the{" "}
        <InlineLink href="https://pollinations.ai/privacy" external>
            Privacy Policy
        </InlineLink>
        .
    </>
);

/** Shared sign-in chrome with stable scrolling content and actions. */
export function AuthFlowLayout({
    children,
    title,
    subject,
    description,
    error,
    titleId,
    headerAction,
    actions,
    footnote = legalFootnote,
    dialog,
    size,
}: AuthFlowLayoutProps) {
    const generatedId = useId();
    const headingId = titleId ?? generatedId;
    return (
        <AuthModal
            dialog={dialog ?? (title ? { labelledBy: headingId } : undefined)}
            size={size}
        >
            <AuthModalHeader>{headerAction}</AuthModalHeader>
            <DialogBody>
                {title && (
                    <div className="polli:space-y-3">
                        <Heading as="h1" size="section" id={headingId}>
                            {title}
                        </Heading>
                        {subject}
                        {description && (
                            // The step instruction: body tone, so it reads as
                            // the sentence's second half rather than a caption.
                            <Text size="sm" tone="base">
                                {description}
                            </Text>
                        )}
                        {error && <ErrorBanner>{error}</ErrorBanner>}
                    </div>
                )}
                {children}
            </DialogBody>
            <div className="polli:shrink-0 polli:bg-theme-bg-pale">
                {actions && <DialogFooter>{actions}</DialogFooter>}
                <AuthModalFootnote>{footnote}</AuthModalFootnote>
            </div>
        </AuthModal>
    );
}

/** The one line under the actions: legal, dashboard, back or help. */
export function AuthModalFootnote({ children }: { children: ReactNode }) {
    return (
        <Text
            size="xs"
            tone="muted"
            className="polli:px-6 polli:pb-5 polli:text-center"
        >
            {children}
        </Text>
    );
}

export function AuthModalHeader({ children }: AuthModalHeaderProps) {
    const logo = (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="polli:block polli:shrink-0 polli:text-theme-text-muted polli:transition-colors polli:hover:text-theme-text-strong polli:focus-visible:outline-2 polli:focus-visible:outline-offset-4"
            aria-label="pollinations.ai"
        >
            <span className="polli:sr-only">pollinations.ai</span>
            <span
                aria-hidden="true"
                className="polli:block polli:h-8 polli:w-8 polli:bg-current"
                style={authMarkMask}
            />
        </a>
    );
    return (
        <div className="polli:shrink-0 polli:p-6 polli:pb-4">
            <div className="polli:flex polli:min-h-10 polli:items-start polli:justify-between polli:gap-3">
                {logo}
                {children}
            </div>
        </div>
    );
}

/** Titled loading screen so the frame never shows an empty body. */
export function AuthModalLoading({
    title,
    subject,
    message = "This only takes a moment.",
}: {
    title: string;
    subject?: ReactNode;
    message?: string;
}) {
    return (
        <AuthFlowLayout title={title} subject={subject}>
            <output className="polli:flex polli:items-center polli:gap-2 polli:font-body polli:text-sm polli:text-theme-text-muted">
                <span
                    aria-hidden="true"
                    className="polli:h-4 polli:w-4 polli:shrink-0 polli:animate-spin polli:rounded-full polli:border-2 polli:border-current polli:border-r-transparent"
                />
                {message}
            </output>
        </AuthFlowLayout>
    );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
    return (
        <Surface
            role="alert"
            className="polli:font-body polli:text-sm polli:leading-6 polli:text-intent-danger-text"
        >
            {children}
        </Surface>
    );
}

export type AuthInfoCardProps = {
    title?: string | null;
    children: ReactNode;
};

export function AuthInfoCard({ title, children }: AuthInfoCardProps) {
    return (
        <Surface className="polli:space-y-3 polli:font-body">
            {title != null && (
                <p className="polli:font-body polli:text-sm polli:font-semibold polli:leading-5 polli:text-theme-text-strong">
                    {title}
                </p>
            )}
            {children}
        </Surface>
    );
}

/**
 * A consent row with expandable details. With `onChange` it carries a
 * checkbox; a required row passes an `icon` instead, which takes the
 * checkbox slot so the rows line up.
 */
export function AuthAccessItem({
    children,
    control,
    details,
    icon,
    checked = false,
    onChange,
    ariaLabel,
    disabled = false,
}: {
    children: ReactNode;
    control?: ReactNode;
    details?: ReactNode;
    /** Rendered instead of the checkbox; the row is then always granted. */
    icon?: ReactNode;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    ariaLabel?: string;
    disabled?: boolean;
}) {
    // A required row has no input to label.
    const Row = icon != null ? "div" : "label";
    return (
        <li>
            <Row
                className={cn(
                    "polli:flex polli:min-h-8 polli:items-center polli:gap-3 polli:font-body polli:text-sm polli:font-semibold polli:leading-5",
                    onChange &&
                        (disabled
                            ? "polli:cursor-not-allowed"
                            : "polli:cursor-pointer"),
                )}
            >
                {icon != null ? (
                    <span
                        aria-hidden="true"
                        className="polli:flex polli:h-5 polli:w-5 polli:shrink-0 polli:items-center polli:justify-center polli:text-theme-text-strong polli:[&>svg]:h-4 polli:[&>svg]:w-4"
                    >
                        {icon}
                    </span>
                ) : (
                    <span className="polli:relative polli:flex polli:h-5 polli:w-5 polli:shrink-0">
                        <input
                            type="checkbox"
                            aria-label={ariaLabel}
                            checked={checked}
                            disabled={disabled || !onChange}
                            onChange={(event) =>
                                onChange?.(event.target.checked)
                            }
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
                )}
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
            </Row>
            {details && (
                <div className="polli:pl-8 polli:font-body polli:text-xs polli:font-normal polli:leading-normal polli:text-theme-text-muted">
                    {details}
                </div>
            )}
        </li>
    );
}
