import { useState, useEffect } from "react";

const STORAGE_KEY = "pollinations-beta-banner-dismissed";

interface BetaBannerProps {
    onVisibilityChange?: (visible: boolean) => void;
}

export function BetaBanner({ onVisibilityChange }: BetaBannerProps) {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const dismissed = localStorage.getItem(STORAGE_KEY) === "true";
        const visible = !dismissed;
        setIsVisible(visible);
        onVisibilityChange?.(visible);
    }, [onVisibilityChange]);

    const handleDismiss = () => {
        localStorage.setItem(STORAGE_KEY, "true");
        setIsVisible(false);
        onVisibilityChange?.(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed top-0 left-0 right-0 z-[60] bg-button-secondary-bg border-b-4 border-border-brand">
            <div className="max-w-4xl mx-auto px-4 py-2 flex items-center justify-between gap-4">
                <p className="font-body text-sm text-text-body-main flex-1 text-center">
                    <span className="mr-1">✨</span>
                    Welcome to our new platform! Still in beta —{" "}
                    <a
                        href="https://old.pollinations.ai"
                        className="font-headline font-black uppercase text-text-brand hover:underline"
                    >
                        visit the old one
                    </a>
                </p>
                <button
                    type="button"
                    onClick={handleDismiss}
                    className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-text-body-main hover:text-text-brand transition-colors font-bold text-lg"
                    aria-label="Dismiss banner"
                >
                    ×
                </button>
            </div>
        </div>
    );
}
