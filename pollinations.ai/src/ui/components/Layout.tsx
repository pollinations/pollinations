import { useRef, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { AUTH_COPY } from "../../copy/content/auth";
import { LAYOUT } from "../../copy/content/layout";
import { SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useAuth } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { useTheme } from "../contexts/ThemeContext";
import { BackgroundRenderer } from "./BackgroundRenderer";
import { Logo } from "./Logo";
import { AIPromptInput } from "./theme/AIPromptInput";
import { UserMenu } from "./UserMenu";
import { Button } from "./ui/button";

const tabKeys = [
    { path: "/", copyKey: "navHello" as const },
    { path: "/play", copyKey: "navPlay" as const },
    { path: "/apps", copyKey: "navApps" as const },
    { path: "/community", copyKey: "navCommunity" as const },
];

import { useFooterVisibility } from "../../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../../hooks/useHeaderVisibility";

const THROTTLE_MS = 1000;

function Layout() {
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const [emailCopied, setEmailCopied] = useState(false);
    const {
        backgroundHtml,
        cyclePreset,
        showThemeCreator,
        setShowThemeCreator,
    } = useTheme();
    const { isLoggedIn, login, apiKey } = useAuth();
    const { copy: authCopy } = usePageCopy(AUTH_COPY);
    const { copy: layoutCopy } = usePageCopy(LAYOUT);
    const lastClickRef = useRef(0);

    const handleLogoClick = () => {
        const now = Date.now();
        if (now - lastClickRef.current < THROTTLE_MS) return;
        lastClickRef.current = now;
        cyclePreset();
    };

    return (
        <div
            className={`relative min-h-screen ${
                backgroundHtml ? "bg-transparent" : "bg-surface-base"
            }`}
        >
            <BackgroundRenderer />
            {/* Fixed Header */}
            <header
                className={`fixed left-0 right-0 z-50 transition-all duration-300 flex flex-col ${
                    showHeader ? "translate-y-0" : "-translate-y-full"
                }`}
                style={{ top: 0 }}
            >
                <div className="w-full px-4 py-3 pb-5 lg:py-4 lg:pb-5">
                    <div className="max-w-4xl mx-auto relative overflow-visible">
                        {/* Mobile/Tablet: Grid — Logo + content on right */}
                        <div
                            className="lg:hidden grid overflow-visible"
                            style={{
                                gridTemplateColumns: "auto minmax(0, 1fr)",
                                gridTemplateRows: "auto auto",
                            }}
                        >
                            {/* Logo: spans both rows */}
                            <div className="row-span-2 flex items-start pr-3">
                                <div className="relative group">
                                    <button
                                        type="button"
                                        onClick={handleLogoClick}
                                        className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                    >
                                        <Logo className="w-20 h-20 object-contain" />
                                    </button>
                                    <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-surface-card text-text-body-main text-[10px] rounded-tag shadow-lg border border-border-main opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                        Change theme
                                    </div>
                                </div>
                            </div>
                            {/* Row 1: Nav tabs */}
                            <div className="flex flex-wrap gap-1 items-center justify-end pb-1">
                                {tabKeys.map((tab) => (
                                    <NavLink
                                        key={tab.path}
                                        to={tab.path}
                                        end={tab.path === "/"}
                                        className="no-underline"
                                    >
                                        {({ isActive }) => (
                                            <Button
                                                variant="nav"
                                                size={null}
                                                data-active={isActive}
                                            >
                                                {layoutCopy[tab.copyKey]}
                                            </Button>
                                        )}
                                    </NavLink>
                                ))}
                            </div>
                            {/* Row 2: Login/Account */}
                            <div className="flex flex-wrap gap-1.5 items-center justify-end pb-1">
                                <UserMenu />
                            </div>
                        </div>
                        {/* Mobile: Theme Creator (Easter egg — shown after logo click) */}
                        {showThemeCreator && (
                            <div className="lg:hidden flex items-center gap-1.5 pt-1 animate-in fade-in duration-300">
                                <AIPromptInput
                                    isLoggedIn={isLoggedIn}
                                    onLoginRequired={login}
                                    apiKey={apiKey}
                                    compact
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowThemeCreator(false)}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-text-body-main hover:text-text-body-main/80 transition-colors"
                                >
                                    ×
                                </button>
                            </div>
                        )}

                        {/* Desktop: Single row — Logo + Nav + Social + UserMenu */}
                        <div className="hidden lg:flex items-center gap-4 overflow-visible">
                            {/* Logo */}
                            <div className="relative group flex-shrink-0">
                                <button
                                    type="button"
                                    onClick={handleLogoClick}
                                    className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                >
                                    <Logo className="w-20 h-20 object-contain" />
                                </button>
                                <div className="absolute left-full top-1/2 -translate-y-1/2 ml-2 px-2 py-1 bg-surface-card text-text-body-main text-[10px] rounded-tag shadow-lg border border-border-main opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                                    Change theme
                                </div>
                            </div>
                            {/* Nav Tabs + Social Icons (scrollable) */}
                            <div className="flex-1 flex gap-3 items-center justify-end overflow-x-auto overflow-y-visible scrollbar-hide">
                                {tabKeys.map((tab) => (
                                    <NavLink
                                        key={tab.path}
                                        to={tab.path}
                                        end={tab.path === "/"}
                                        className="no-underline"
                                    >
                                        {({ isActive }) => (
                                            <Button
                                                variant="nav"
                                                size={null}
                                                data-active={isActive}
                                            >
                                                {layoutCopy[tab.copyKey]}
                                            </Button>
                                        )}
                                    </NavLink>
                                ))}
                                {Object.entries(SOCIAL_LINKS)
                                    .filter(
                                        ([key]) =>
                                            key === "discord" ||
                                            key === "github",
                                    )
                                    .map(
                                        ([key, { url, icon: Icon, label }]) => (
                                            <Button
                                                key={key}
                                                as="a"
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title={label}
                                                variant="icon"
                                                size={null}
                                                className="text-text-body-main"
                                            >
                                                <Icon className="w-full h-full" />
                                            </Button>
                                        ),
                                    )}
                            </div>
                            {/* UserMenu (outside scroll container so dropdown isn't clipped) */}
                            <UserMenu />
                        </div>
                        {/* Desktop: Theme Creator (Easter egg — shown after logo click) */}
                        {showThemeCreator && (
                            <div className="hidden lg:flex items-center gap-2 pt-2 animate-in fade-in duration-300">
                                <AIPromptInput
                                    isLoggedIn={isLoggedIn}
                                    onLoginRequired={login}
                                    apiKey={apiKey}
                                    compact
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowThemeCreator(false)}
                                    className="flex-shrink-0 w-5 h-5 flex items-center justify-center rounded-full text-text-body-main hover:text-text-body-main/80 transition-colors"
                                >
                                    ×
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </header>

            {/* Main Content - Full Bleed */}
            <main className="w-full min-h-screen pb-40 lg:pb-24 transition-all duration-200 pt-48 lg:pt-40">
                <Outlet />
            </main>

            {/* Floating Glassy Footer */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                {/* Mobile/Tablet: Simplified footer */}
                <div className="lg:hidden">
                    <div className="w-full px-4 py-3">
                        <div className="max-w-4xl mx-auto flex flex-col gap-3">
                            {/* 1. Social Icons */}
                            <div className="flex items-center justify-center">
                                <div className="flex items-center">
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.github.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.github.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.github.icon className="w-full h-full" />
                                    </Button>
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.discord.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.discord.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.discord.icon className="w-full h-full" />
                                    </Button>
                                    {/* All Other Social Icons */}
                                    {Object.entries(SOCIAL_LINKS)
                                        .filter(
                                            ([key]) =>
                                                key !== "github" &&
                                                key !== "discord",
                                        )
                                        .map(
                                            ([
                                                key,
                                                { url, icon: Icon, label },
                                            ]) => (
                                                <Button
                                                    key={key}
                                                    as="a"
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={label}
                                                    variant="icon"
                                                    size={null}
                                                    className="w-10 h-10 text-text-body-main"
                                                >
                                                    <Icon className="w-full h-full" />
                                                </Button>
                                            ),
                                        )}
                                </div>
                            </div>

                            {/* 2. Terms, Privacy, Email, Enter */}
                            <div className="flex items-center justify-center">
                                <Button
                                    as={Link}
                                    to="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.termsLink}
                                    </span>
                                </Button>
                                <Button
                                    as={Link}
                                    to="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.privacyLink}
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai",
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000,
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.emailLink}
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            {layoutCopy.copiedLabel}
                                        </span>
                                    )}
                                </Button>
                                <Button
                                    as="a"
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                        {isLoggedIn
                                            ? authCopy.enterButton
                                            : authCopy.registerButton}
                                    </span>
                                    <ExternalLinkIcon className="w-3 h-3 text-text-brand" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop: Single line footer */}
                <div className="hidden lg:block w-full px-4 py-3">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between gap-6">
                            {/* Left: Branding Text */}
                            <div className="text-left flex-shrink-0">
                                <p className="font-headline text-xs font-black text-text-body-main uppercase tracking-wider">
                                    {layoutCopy.footerBranding}
                                </p>
                                <p className="font-body text-[10px] text-text-body-main">
                                    {layoutCopy.footerTagline}
                                </p>
                            </div>

                            {/* Center: Links as Buttons */}
                            <div className="flex items-center flex-shrink-0">
                                <Button
                                    as={Link}
                                    to="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.termsLink}
                                    </span>
                                </Button>
                                <Button
                                    as={Link}
                                    to="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.privacyLink}
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai",
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000,
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        {layoutCopy.emailLink}
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            {layoutCopy.copiedLabel}
                                        </span>
                                    )}
                                </Button>
                            </div>

                            {/* Right: Social Buttons */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    {/* GitHub */}
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.github.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.github.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.github.icon className="w-full h-full" />
                                    </Button>
                                    {/* Discord */}
                                    <Button
                                        as="a"
                                        href={SOCIAL_LINKS.discord.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        title={SOCIAL_LINKS.discord.label}
                                        variant="icon"
                                        size={null}
                                        className="w-10 h-10 text-text-body-main"
                                    >
                                        <SOCIAL_LINKS.discord.icon className="w-full h-full" />
                                    </Button>
                                    {/* All Other Social Icons */}
                                    {Object.entries(SOCIAL_LINKS)
                                        .filter(
                                            ([key]) =>
                                                key !== "github" &&
                                                key !== "discord",
                                        )
                                        .map(
                                            ([
                                                key,
                                                { url, icon: Icon, label },
                                            ]) => (
                                                <Button
                                                    key={key}
                                                    as="a"
                                                    href={url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    title={label}
                                                    variant="icon"
                                                    size={null}
                                                    className="w-10 h-10 text-text-body-main"
                                                >
                                                    <Icon className="w-full h-full" />
                                                </Button>
                                            ),
                                        )}
                                </div>
                                {/* Register Button */}
                                <Button
                                    as="a"
                                    href="https://enter.pollinations.ai"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                        {isLoggedIn
                                            ? authCopy.enterButton
                                            : authCopy.registerButton}
                                    </span>
                                    <ExternalLinkIcon className="w-4 h-4 text-text-brand" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
