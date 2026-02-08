import { useEffect, useRef, useState } from "react";
import { AUTH_COPY } from "../../copy/content/auth";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Button } from "./ui/button";

const TIER_EMOJI: Record<string, string> = {
    microbe: "🦠",
    spore: "🦠",
    seed: "🌱",
    flower: "🌸",
    nectar: "🍯",
};

export function UserMenu() {
    const { apiKey, isLoggedIn, profile, balance, login, logout } = useAuth();
    const { copy } = usePageCopy(AUTH_COPY);
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        if (!isOpen) return;
        const handler = (e: MouseEvent) => {
            if (
                menuRef.current &&
                !menuRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, [isOpen]);

    if (!isLoggedIn) {
        return (
            <Button
                variant="primary"
                size={null}
                onClick={login}
                className="px-3 py-1.5 lg:px-5 lg:py-3 text-xs"
            >
                {copy.loginButton}
            </Button>
        );
    }

    const tierEmoji = TIER_EMOJI[profile?.tier || ""] || "🌱";
    const displayName = profile?.githubUsername
        ? `@${profile.githubUsername}`
        : profile?.name || "User";

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-1.5 px-3 py-1.5 lg:px-3 lg:py-3 font-headline text-xs font-black uppercase tracking-wider text-text-body-main bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-brand rounded-button transition-all hover:bg-button-secondary-bg hover:shadow-shadow-brand-md whitespace-nowrap"
            >
                <span>{tierEmoji}</span>
                <span className="max-w-[140px] truncate">{displayName}</span>
                {balance !== null && (
                    <span className="text-text-brand">
                        {balance.balance.toFixed(1)} {copy.pollenUnit}
                    </span>
                )}
                <span className="text-[8px]">▾</span>
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-64 bg-surface-base border-r-4 border-b-4 border-border-brand rounded-button p-4 z-50 shadow-shadow-brand-lg">
                    {/* Profile */}
                    {profile && (
                        <div className="mb-3">
                            <span className="text-[10px] uppercase tracking-wider text-text-body-tertiary font-medium block">
                                {copy.accountLabel}
                            </span>
                            <span className="font-headline text-sm font-black text-text-body-main">
                                {displayName}
                            </span>
                            {profile.tier && (
                                <span className="ml-2 text-xs text-text-body-secondary">
                                    {tierEmoji} {profile.tier}
                                </span>
                            )}
                        </div>
                    )}

                    {/* Balance */}
                    {balance !== null && (
                        <div className="mb-3">
                            <span className="text-[10px] uppercase tracking-wider text-text-body-tertiary font-medium block">
                                {copy.balanceLabel}
                            </span>
                            <span className="font-headline text-sm font-black text-text-brand">
                                {balance.balance.toFixed(2)} {copy.pollenUnit}
                            </span>
                        </div>
                    )}

                    {/* API Key */}
                    <div className="mb-4">
                        <span className="text-[10px] uppercase tracking-wider text-text-body-tertiary font-medium block">
                            {copy.apiKeyLabel}
                        </span>
                        <span className="font-mono text-sm text-text-body-secondary">
                            {apiKey.slice(0, 7)}••••
                        </span>
                    </div>

                    {/* Logout */}
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                            logout();
                            setIsOpen(false);
                        }}
                        className="w-full"
                    >
                        {copy.logoutButton}
                    </Button>
                </div>
            )}
        </div>
    );
}
