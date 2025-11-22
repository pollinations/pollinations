import { NavLink, Outlet } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { SOCIAL_LINKS } from "../../content/copy/socialLinks";
import { useTheme } from "../contexts/ThemeContext";
import { generateTheme } from "../../content/guidelines/helpers/styling-helpers";
import type { ThemeDictionary } from "../../content/theme/engine";
import { SparklesIcon, SendIcon } from "lucide-react";

const tabs = [
    { path: "/", label: "Hello" },
    { path: "/play", label: "Play" },
    { path: "/docs", label: "Docs" },
    { path: "/apps", label: "Apps" },
    { path: "/community", label: "Community" },
];

import { useFooterVisibility } from "../../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../../hooks/useHeaderVisibility";

// --- Theme Prompt Banner Component ---
function ThemePromptBanner({
    isOpen,
    prompt,
    setPrompt,
    loading,
    onSubmit,
    inputRef,
    error,
}: {
    isOpen: boolean;
    prompt: string;
    setPrompt: (s: string) => void;
    loading: boolean;
    onSubmit: (e?: React.FormEvent) => void;
    inputRef: React.RefObject<HTMLInputElement | null>;
    error: string | null;
}) {
    if (!isOpen) return null;

    return (
        <div
            className="w-full h-16 animate-in fade-in slide-in-from-top-2 duration-200 flex items-center justify-center"
            style={{
                backgroundColor: "var(--t010)",
            }}
        >
            <form
                onSubmit={onSubmit}
                className="w-full max-w-4xl mx-auto flex items-center h-full px-4 md:px-8 gap-4"
            >
                <Button
                    type="submit"
                    disabled={!prompt.trim() || loading}
                    variant="icon"
                    size={null}
                    className="w-6 h-6 md:w-8 md:h-8 text-text-body-main flex-shrink-0"
                >
                    {loading ? (
                        <SparklesIcon className="w-4 h-4 md:w-5 md:h-5 animate-spin" />
                    ) : (
                        <SendIcon className="w-4 h-4 md:w-5 md:h-5" />
                    )}
                </Button>

                <div className="flex-1 relative h-full flex items-center">
                    <style>
                        {`
                            .theme-prompt-input::placeholder {
                                color: var(--t003) !important;
                                opacity: 1 !important;
                            }
                        `}
                    </style>
                    <input
                        ref={inputRef}
                        id="theme-prompt"
                        name="theme-prompt"
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Describe a theme (e.g. 'Cyberpunk Neon')..."
                        className="theme-prompt-input w-full h-full bg-transparent outline-none text-base md:text-lg font-medium rounded-input"
                        style={{
                            color: "var(--t002)",
                            caretColor: "var(--t006)",
                        }}
                        disabled={loading}
                    />
                </div>
            </form>
            {error && (
                <div className="absolute top-full left-0 right-0 bg-red-500 text-white text-[10px] px-2 py-1 text-center">
                    {error && typeof error === "object" && "message" in error
                        ? (error as Error).message
                        : String(error)}
                </div>
            )}
        </div>
    );
}

function Layout() {
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const [emailCopied, setEmailCopied] = useState(false);

    // AI Theme Prompt State
    const [isPromptOpen, setIsPromptOpen] = useState(false);
    const [prompt, setPrompt] = useState("");
    const [activePrompt, setActivePrompt] = useState<string | null>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const { setTheme } = useTheme();
    const [generatedTheme, setGeneratedTheme] =
        useState<ThemeDictionary | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<any>(null);

    // Generate theme when activePrompt changes
    useEffect(() => {
        if (!activePrompt) return;

        const controller = new AbortController();
        setLoading(true);
        setError(null);

        generateTheme(activePrompt, controller.signal)
            .then((theme) => {
                if (!controller.signal.aborted) {
                    setGeneratedTheme(theme);
                }
            })
            .catch((err) => {
                if (err.name !== "AbortError" && !controller.signal.aborted) {
                    setError(err);
                }
            })
            .finally(() => {
                if (!controller.signal.aborted) {
                    setLoading(false);
                }
            });

        return () => controller.abort();
    }, [activePrompt]);

    // Focus input when opened
    useEffect(() => {
        if (isPromptOpen) {
            setTimeout(() => inputRef.current?.focus(), 100);
        }
    }, [isPromptOpen]);

    // Apply theme when generated
    useEffect(() => {
        if (generatedTheme) {
            setTheme(generatedTheme);
            // Keep the prompt text so user can see what they generated
            setActivePrompt(null); // Clear active prompt after success
            setGeneratedTheme(null); // Clear for next generation
        }
    }, [generatedTheme, setTheme]);

    const handleLogoClick = () => {
        setIsPromptOpen(!isPromptOpen);
    };

    const handleSubmit = (e?: React.FormEvent) => {
        e?.preventDefault();
        if (prompt.trim() && !loading) {
            setActivePrompt(prompt); // Trigger generation
        }
    };

    return (
        <div className="relative min-h-screen bg-surface-base">
            {/* Fixed Header */}
            <header
                className={`fixed top-0 left-0 right-0 z-50 transition-transform duration-300 flex flex-col ${
                    showHeader ? "translate-y-0" : "-translate-y-full"
                }`}
            >
                <div className="w-full px-4 py-3 md:py-4">
                    <div className="max-w-4xl mx-auto pl-2 md:pl-8 relative">
                        {/* Mobile: Logo left, Two rows of buttons right */}
                        <div className="md:hidden flex items-center gap-3">
                            {/* Logo - Left side */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={handleLogoClick}
                                    className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                >
                                    <Logo className="w-24 h-24 object-contain" />
                                </button>
                            </div>

                            {/* Navigation Tabs - Two rows right-aligned */}
                            <div className="flex flex-col gap-2 flex-1">
                                {/* Row 1: Hello, Play, Docs */}
                                <div className="flex gap-2 justify-end">
                                    {tabs.slice(0, 3).map((tab) => (
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
                                                    className="min-w-[60px]"
                                                >
                                                    {tab.label}
                                                </Button>
                                            )}
                                        </NavLink>
                                    ))}
                                </div>
                                {/* Row 2: Apps, Community */}
                                <div className="flex gap-2 justify-end">
                                    {tabs.slice(3, 5).map((tab) => (
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
                                                    className="min-w-[60px]"
                                                >
                                                    {tab.label}
                                                </Button>
                                            )}
                                        </NavLink>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Desktop: Logo left, Buttons right */}
                        <div className="hidden md:block">
                            <div className="flex items-center justify-between gap-4 overflow-visible">
                                {/* Logo - Left side */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        onClick={handleLogoClick}
                                        className="flex-shrink-0 focus:outline-none transition-transform active:scale-95"
                                    >
                                        <Logo className="w-20 h-20 object-contain" />
                                    </button>
                                </div>

                                {/* Navigation Tabs + Social Links - Right side */}
                                <div className="flex gap-3 items-center overflow-x-auto scrollbar-hide">
                                    {/* Navigation Tabs */}
                                    {tabs.map((tab) => (
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
                                                    {tab.label}
                                                </Button>
                                            )}
                                        </NavLink>
                                    ))}

                                    {/* Social Media Links + Enter Button */}
                                    <div className="flex gap-2 items-center">
                                        {Object.entries(SOCIAL_LINKS)
                                            .filter(
                                                ([key]) =>
                                                    key === "discord" ||
                                                    key === "github"
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
                                                        className="text-text-body-main"
                                                    >
                                                        <Icon className="w-full h-full" />
                                                    </Button>
                                                )
                                            )}

                                        {/* Enter Button */}
                                        <Button
                                            as="a"
                                            href="https://enter.pollinations.ai"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            variant="iconText"
                                            size={null}
                                        >
                                            <span className="font-headline text-xs font-black uppercase tracking-wider text-text-brand">
                                                Enter
                                            </span>
                                            <ExternalLinkIcon className="w-4 h-4 text-text-brand" />
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Full Width Theme Prompt Banner */}
                <ThemePromptBanner
                    isOpen={isPromptOpen}
                    prompt={prompt}
                    setPrompt={setPrompt}
                    loading={loading}
                    onSubmit={handleSubmit}
                    inputRef={inputRef}
                    error={error}
                />
            </header>

            {/* Main Content - Full Bleed */}
            <main
                className="w-full min-h-screen pb-40 md:pb-24 transition-all duration-200 pt-[calc(8rem+var(--banner-offset))] md:pt-[calc(7rem+var(--banner-offset))]"
                style={
                    {
                        "--banner-offset": isPromptOpen ? "4rem" : "0px",
                    } as React.CSSProperties
                }
            >
                <Outlet />
            </main>

            {/* Floating Glassy Footer */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                {/* Mobile: Simplified footer */}
                <div className="md:hidden">
                    <div className="w-full px-4 py-3">
                        <div className="max-w-4xl mx-auto flex flex-col gap-3">
                            {/* 1. Social Icons + Enter */}
                            <div className="flex items-center justify-center gap-3">
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
                                                key !== "discord"
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
                                            )
                                        )}
                                </div>
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
                                        Enter
                                    </span>
                                    <ExternalLinkIcon className="w-3 h-3 text-text-brand" />
                                </Button>
                            </div>

                            {/* 2. Terms, Privacy, Email */}
                            <div className="flex items-center justify-center">
                                <Button
                                    as="a"
                                    href="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Terms
                                    </span>
                                </Button>
                                <Button
                                    as="a"
                                    href="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Privacy
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai"
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Email
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            Copied!
                                        </span>
                                    )}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop: Single line with mobile styling */}
                <div className="hidden md:block w-full px-4 py-3">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between gap-6">
                            {/* Left: Branding Text */}
                            <div className="text-left flex-shrink-0">
                                <p className="font-headline text-xs font-black text-text-body-main uppercase tracking-wider">
                                    Pollinations.AI - 2025
                                </p>
                                <p className="font-body text-[10px] text-text-body-main">
                                    Open source AI innovation from Berlin
                                </p>
                            </div>

                            {/* Center: Links as Buttons */}
                            <div className="flex items-center flex-shrink-0">
                                <Button
                                    as="a"
                                    href="/terms"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Terms
                                    </span>
                                </Button>
                                <Button
                                    as="a"
                                    href="/privacy"
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Privacy
                                    </span>
                                </Button>
                                <Button
                                    type="button"
                                    onClick={() => {
                                        navigator.clipboard.writeText(
                                            "hello@pollinations.ai"
                                        );
                                        setEmailCopied(true);
                                        setTimeout(
                                            () => setEmailCopied(false),
                                            2000
                                        );
                                    }}
                                    variant="iconText"
                                    size={null}
                                    className="h-10"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider text-text-body-main">
                                        Email
                                    </span>
                                    {emailCopied && (
                                        <span className="absolute -top-8 left-0 font-headline text-xs font-black text-text-brand uppercase tracking-wider">
                                            Copied!
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
                                                key !== "discord"
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
                                            )
                                        )}
                                </div>
                                {/* Enter Button */}
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
                                        Enter
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
