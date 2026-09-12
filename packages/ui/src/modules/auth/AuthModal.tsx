import type { CSSProperties, ReactNode } from "react";
import wordmarkUrl from "../../brand/lockup-horizontal.svg";
import logoUrl from "../../brand/mark.svg";
import { cn } from "../../lib/cn.ts";
import { Dialog } from "../../primitives/Dialog.tsx";
import { InlineLink } from "../../primitives/InlineLink.tsx";
import { CheckIcon } from "../../primitives/icons/index.tsx";
import { ScrollArea } from "../../primitives/ScrollArea.tsx";
import { Surface } from "../../primitives/Surface.tsx";
import { Heading } from "../../primitives/Typography.tsx";

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
        initialFocusEl?: () => HTMLElement | null;
    };
};

export function AuthModal({
    children,
    contentClassName,
    dialog,
}: AuthModalProps) {
    return (
        <Dialog
            open
            layout="flow"
            showBackdrop={false}
            ariaLabel={dialog?.label}
            labelledBy={dialog?.labelledBy}
            initialFocusEl={dialog?.initialFocusEl}
            positionerClassName="polli:bg-app-bg"
            contentClassName={contentClassName}
        >
            {children}
        </Dialog>
    );
}

export type AuthModalHeaderProps = {
    children?: ReactNode;
    logoOnly?: boolean;
};

/** Shared consent/sign-in chrome; scrolling content never changes the footer width. */
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
        <AuthModal dialog={dialog}>
            <ScrollArea className="polli:min-h-0 polli:flex-1 polli:overscroll-contain polli:scroll-pt-28 polli:scroll-pb-4 polli:sm:rounded-t-2xl">
                <div className="polli:flex polli:min-h-full polli:flex-col">
                    <div className="polli:sticky polli:top-0 polli:z-10 polli:shrink-0 polli:bg-surface-white/80 polli:pb-3 polli:backdrop-blur-md">
                        <AuthModalHeader logoOnly>{account}</AuthModalHeader>
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
        </AuthModal>
    );
}

/** Shared responsive action row for consent and dashboard key dialogs. */
export function AuthActionButtons({
    actions,
    secondaryAction,
}: {
    actions: ReactNode;
    secondaryAction?: ReactNode;
}) {
    if (!actions && !secondaryAction) return null;
    const primarySlot = (
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
    );
    const secondarySlot = (
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
    );
    return (
        <div className="polli:@container/auth-footer polli:w-full polli:[&_button]:rounded-md polli:[&_a]:rounded-md polli:[&_button]:font-body polli:[&_a]:font-body polli:[&_button]:text-sm polli:[&_a]:text-sm">
            <div className="polli:grid polli:w-full polli:grid-cols-1 polli:gap-3 polli:@min-[320px]/auth-footer:grid-cols-[minmax(7.5rem,max-content)_minmax(0,1fr)]">
                {secondaryAction && secondarySlot}
                {actions && primarySlot}
            </div>
        </div>
    );
}

export function AuthActionFooter({
    actions,
    secondaryAction,
    className,
}: {
    actions: ReactNode;
    secondaryAction?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                "polli:sticky polli:bottom-0 polli:z-10 polli:flex polli:shrink-0 polli:flex-col polli:items-center polli:gap-3 polli:bg-surface-white/80 polli:p-6 polli:pt-4 polli:backdrop-blur-md",
                className,
            )}
        >
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

export function AuthModalHeader({
    children,
    logoOnly = false,
}: AuthModalHeaderProps) {
    return (
        <div className="polli:@container/auth-header polli:px-6 polli:pt-6 polli:pb-2">
            <div className="polli:flex polli:min-h-13 polli:flex-wrap polli:items-center polli:justify-between polli:gap-3">
                <a
                    href="https://pollinations.ai"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="polli:inline-flex polli:shrink-0 polli:items-center polli:text-theme-text-strong"
                    aria-label="pollinations.ai"
                >
                    <span className="polli:sr-only">Pollinations</span>
                    <span
                        aria-hidden="true"
                        className={cn(
                            "polli:block polli:h-8 polli:w-8 polli:bg-current",
                            !logoOnly &&
                                (children
                                    ? "polli:@min-[400px]/auth-header:hidden"
                                    : "polli:@min-[240px]/auth-header:hidden"),
                        )}
                        style={authLogoMask}
                    />
                    {!logoOnly && (
                        <span
                            aria-hidden="true"
                            className={cn(
                                "polli:hidden polli:h-7 polli:w-[220px] polli:bg-current",
                                children
                                    ? "polli:@min-[400px]/auth-header:block"
                                    : "polli:@min-[240px]/auth-header:block",
                            )}
                            style={{
                                ...authLogoMask,
                                WebkitMaskImage: `url('${wordmarkUrl}')`,
                                maskImage: `url('${wordmarkUrl}')`,
                            }}
                        />
                    )}
                </a>
                {children}
            </div>
        </div>
    );
}

export function AuthModalLoading({
    title,
    message = "Checking whether you’re signed in…",
}: {
    title: string;
    message?: string;
}) {
    return (
        <AuthFlowLayout dialog={{ label: title }} actions={null}>
            <Heading as="h1" size="section" className="polli:pt-3">
                {title}
            </Heading>
            <output className="polli:flex polli:items-center polli:gap-2 polli:text-sm polli:text-theme-text-muted">
                <span
                    aria-hidden="true"
                    className="polli:h-2 polli:w-2 polli:shrink-0 polli:rounded-full polli:bg-current polli:animate-pulse polli:motion-reduce:animate-none"
                />
                {message}
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
    titleId?: string;
    children: ReactNode;
};

export function AuthInfoCard({
    title = "Authorize",
    titleId,
    children,
}: AuthInfoCardProps) {
    return (
        <Surface variant="card-themed">
            {title != null && (
                <p
                    id={titleId}
                    className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft"
                >
                    {title}
                </p>
            )}
            {children}
        </Surface>
    );
}

export function AuthAccessSummary({
    title,
    children,
    note,
}: {
    title: ReactNode;
    children: ReactNode;
    note?: ReactNode;
}) {
    return (
        <section className="polli:pt-2 polli:pb-3">
            <h2 className="polli:mb-2 polli:font-body polli:text-xs polli:font-semibold polli:tracking-wide polli:text-theme-text-soft">
                {title}
            </h2>
            <Surface variant="card-themed">
                <ul className="polli:space-y-3 polli:text-sm polli:text-theme-text-base">
                    {children}
                </ul>
            </Surface>
            {note != null && (
                <p className="polli:mt-3 polli:text-xs polli:text-theme-text-soft">
                    {note}
                </p>
            )}
        </section>
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
