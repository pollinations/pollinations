import { useEffect, useRef, useState } from "react";
import { AUTH_COPY } from "../../copy/content/auth";
import { LINKS } from "../../copy/content/socialLinks";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Button } from "./ui/button";

const TIER_EMOJI: Record<string, string> = {
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
                className="px-3 py-1.5 lg:px-5 lg:py-1.5 text-base"
            >
                {copy.loginButton}
            </Button>
        );
    }

    const tierEmoji = profile?.tier ? TIER_EMOJI[profile.tier] : null;
    const displayName = profile?.githubUsername
        ? profile.githubUsername
        : profile?.name || copy.defaultUsername;

    return (
        <div ref={menuRef} className="relative">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center gap-2 px-3 py-1.5 font-headline text-base font-black uppercase tracking-wider text-text-body-main bg-surface-page backdrop-blur-md border-r-4 border-b-4 border-border-brand rounded-button transition-all hover:bg-button-secondary-bg hover:shadow-shadow-brand-md whitespace-nowrap"
            >
                {profile?.image && (
                    <img
                        src={profile.image}
                        alt=""
                        className="w-5 h-5 rounded-full"
                    />
                )}
                <span className="max-w-[140px] truncate">{displayName}</span>
                {balance !== null && (
                    <span className="text-text-brand">
                        {balance.balance.toFixed(1)} {copy.pollenUnit}
                    </span>
                )}
            </button>

            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-[rgb(var(--surface-base))] backdrop-blur-md border-r-4 border-b-4 border-border-brand rounded-button p-4 z-50 shadow-shadow-brand-lg">
                    {/* Profile */}
                    {profile && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-text-body-tertiary font-medium block mb-1">
                                {copy.accountLabel}
                            </span>
                            <div className="flex items-center gap-1.5">
                                {profile.image && (
                                    <img
                                        src={profile.image}
                                        alt=""
                                        className="w-5 h-5 rounded-full shrink-0"
                                    />
                                )}
                                <span className="font-headline text-base font-black text-text-body-main">
                                    {displayName}
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Balance */}
                    {balance !== null && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-text-body-tertiary font-medium block">
                                {copy.balanceLabel}
                            </span>
                            <span className="font-headline text-base font-black text-text-brand">
                                {balance.balance.toFixed(2)} {copy.pollenUnit}
                            </span>
                        </div>
                    )}

                    {/* Tier (creator tiers only) */}
                    {tierEmoji && profile?.tier && (
                        <div className="mb-3">
                            <span className="text-xs uppercase tracking-wider text-text-body-tertiary font-medium block">
                                {copy.tierLabel}
                            </span>
                            <span className="font-headline text-base font-black text-text-body-main">
                                {tierEmoji}{" "}
                                {profile.tier.charAt(0).toUpperCase() +
                                    profile.tier.slice(1)}
                            </span>
                        </div>
                    )}

                    {/* API Key */}
                    <div className="mb-4">
                        <span className="text-xs uppercase tracking-wider text-text-body-tertiary font-medium block">
                            {copy.apiKeyLabel}
                        </span>
                        <span className="font-mono text-base text-text-body-secondary">
                            {apiKey.slice(0, 4)}••••••••
                        </span>
                    </div>

                    {/* BYOP CTA */}
                    <a
                        href={LINKS.byopDocs}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block mb-4 p-2 rounded-md bg-[rgb(var(--surface-page))] hover:opacity-80 transition-opacity"
                    >
                        <span className="text-xs uppercase tracking-wider text-text-brand font-bold block">
                            🔌 {copy.byopTitle}
                        </span>
                        <span className="text-xs text-text-body-secondary block mt-0.5">
                            {copy.byopDescription}
                        </span>
                        <span className="text-xs text-text-brand font-medium mt-1 block">
                            {copy.byopLink} →
                        </span>
                    </a>

                    {/* Enter Dashboard */}
                    <Button
                        as="a"
                        href={LINKS.enter}
                        target="_blank"
                        rel="noopener noreferrer"
                        variant="primary"
                        size="sm"
                        className="w-full mb-2"
                    >
                        {copy.enterLink}
                    </Button>

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
