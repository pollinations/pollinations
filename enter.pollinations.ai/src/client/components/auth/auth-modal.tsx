import type { ReactNode } from "react";

type AuthModalProps = {
    children: ReactNode;
    dialog?: {
        label?: string;
        labelledBy?: string;
    };
    tone?: "default" | "error";
};

// Backdrop uses `items-start` + `my-auto` on the card so short dialogs center
// vertically and tall dialogs scroll the page. One variant fits both cases.
export function AuthModal({
    children,
    dialog,
    tone = "default",
}: AuthModalProps) {
    const dialogProps = dialog
        ? {
              role: "dialog" as const,
              "aria-modal": true,
              ...(dialog.label && { "aria-label": dialog.label }),
              ...(dialog.labelledBy && {
                  "aria-labelledby": dialog.labelledBy,
              }),
          }
        : {};
    const borderClass =
        tone === "error" ? "border-red-300" : "border-amber-300";
    return (
        <div className="fixed inset-0 flex items-start justify-center p-4 overflow-y-auto bg-green-950/50">
            <div
                className={`bg-amber-50 border-2 ${borderClass} rounded-lg shadow-lg max-w-xl w-full my-auto`}
                {...dialogProps}
            >
                {children}
            </div>
        </div>
    );
}

type AuthModalHeaderProps = {
    // Right-side content (user chip + balance pill on signed-in authorize view)
    children?: ReactNode;
};

export function AuthModalHeader({ children }: AuthModalHeaderProps) {
    const logo = (
        <a
            href="https://pollinations.ai"
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0"
        >
            <img
                src="/logo.svg"
                alt="pollinations.ai"
                className="h-8 w-8 object-contain invert"
            />
        </a>
    );
    if (!children) {
        return <div className="flex justify-start px-6 pt-6">{logo}</div>;
    }
    return (
        <div className="px-6 pt-6 pb-2">
            <div className="flex items-center justify-between gap-3">
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
            <div className="px-8 pb-8 pt-2 text-center">
                <p className="text-gray-900">Loading...</p>
            </div>
        </AuthModal>
    );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
    return (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg p-4">
            <p className="text-red-800 text-sm">{children}</p>
        </div>
    );
}

type AuthInfoCardProps = {
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
        <div className="bg-amber-100 border-2 border-amber-300 rounded-lg p-4">
            <p
                id={titleId}
                className="font-body text-xs font-semibold text-amber-800 tracking-wide mb-2"
            >
                {title}
            </p>
            {children}
        </div>
    );
}
