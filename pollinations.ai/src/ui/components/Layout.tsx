import { useCallback, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AUTH_COPY } from "../../copy/content/auth";
import { LAYOUT, LAYOUT_NO_TRANSLATE } from "../../copy/content/layout";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useAuthState } from "../../hooks/useAuth";
import { useFooterVisibility } from "../../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../../hooks/useHeaderVisibility";
import { usePageCopy } from "../../hooks/usePageCopy";
import { ExternalLinkIcon } from "../assets/ExternalLinkIcon";
import { Logo } from "./Logo";
import { SceneBackground } from "./SceneBackground";
import { Button } from "./ui/button";

const tabKeys = [
    { path: "/", copyKey: "navHello" as const },
    { path: "/play", copyKey: "navPlay" as const },
    { path: "/apps", copyKey: "navApps" as const },
    { path: "/community", copyKey: "navCommunity" as const },
];

function SocialIcons() {
    return (
        <>
            <Button
                as="a"
                href={SOCIAL_LINKS.github.url}
                target="_blank"
                rel="noopener noreferrer"
                title={SOCIAL_LINKS.github.label}
                variant="icon"
                size={null}
                className="w-7 h-7"
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
                className="w-7 h-7"
            >
                <SOCIAL_LINKS.discord.icon className="w-full h-full" />
            </Button>
            {Object.entries(SOCIAL_LINKS)
                .filter(([key]) => key !== "github" && key !== "discord")
                .map(([key, { url, icon: Icon, label }]) => (
                    <Button
                        key={key}
                        as="a"
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={label}
                        variant="icon"
                        size={null}
                        className="w-7 h-7"
                    >
                        <Icon className="w-full h-full" />
                    </Button>
                ))}
        </>
    );
}

const tertiaryBtn =
    "h-7 bg-[rgb(var(--tertiary-strong))] text-dark hover:!bg-[rgb(var(--tertiary-strong)/0.8)] hover:!text-dark hover:[&>*]:!text-dark";
const labelCls = "font-headline text-[7px] font-black uppercase tracking-wider";

function FooterLinks({
    layoutCopy,
    emailCopied,
    onCopyEmail,
}: {
    layoutCopy: Record<string, string>;
    emailCopied: boolean;
    onCopyEmail: () => void;
}) {
    return (
        <>
            <Button
                as={Link}
                to="/terms"
                variant="iconText"
                size={null}
                className={tertiaryBtn}
            >
                <span className={labelCls}>{layoutCopy.termsLink}</span>
            </Button>
            <Button
                as={Link}
                to="/privacy"
                variant="iconText"
                size={null}
                className={tertiaryBtn}
            >
                <span className={labelCls}>{layoutCopy.privacyLink}</span>
            </Button>
            <Button
                type="button"
                onClick={onCopyEmail}
                variant="iconText"
                size={null}
                className={tertiaryBtn}
            >
                <span className={labelCls}>{layoutCopy.emailLink}</span>
                <span
                    className={`absolute -top-8 left-0 font-body text-xs font-bold text-dark uppercase tracking-wider transition-opacity duration-200 ${emailCopied ? "opacity-100" : "opacity-0"}`}
                >
                    {layoutCopy.copiedLabel}
                </span>
            </Button>
        </>
    );
}

function EnterButton({
    isLoggedIn,
    authCopy,
}: {
    isLoggedIn: boolean;
    authCopy: Record<string, string>;
}) {
    return (
        <Button
            as="a"
            href={LINKS.enter}
            target="_blank"
            rel="noopener noreferrer"
            variant="iconText"
            size={null}
            className="h-7 bg-[rgb(var(--primary-strong))] text-dark hover:!bg-[rgb(var(--primary-strong)/0.8)] hover:!text-dark hover:[&>*]:!text-dark"
        >
            <span className={labelCls}>
                {isLoggedIn ? authCopy.enterButton : authCopy.registerButton}
            </span>
            <ExternalLinkIcon className="w-3 h-3" />
        </Button>
    );
}

function Layout() {
    const location = useLocation();
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const [emailCopied, setEmailCopied] = useState(false);
    const { isLoggedIn } = useAuthState();
    const { copy: authCopy } = usePageCopy(AUTH_COPY);
    const { copy: layoutCopy } = usePageCopy(LAYOUT, LAYOUT_NO_TRANSLATE);
    const handleCopyEmail = useCallback(() => {
        navigator.clipboard.writeText(layoutCopy.contactEmail);
        setEmailCopied(true);
        setTimeout(() => setEmailCopied(false), 2000);
    }, [layoutCopy.contactEmail]);

    return (
        <div className="relative min-h-screen">
            <SceneBackground />
            {/* Fixed Header */}
            <header
                className={`fixed left-0 right-0 z-50 transition-transform duration-300 will-change-transform flex flex-col ${
                    showHeader ? "translate-y-0" : "-translate-y-full"
                }`}
                style={{ top: 0 }}
            >
                <div className="w-full px-4 py-3 pb-5 lg:py-4 lg:pb-5">
                    <div className="max-w-4xl mx-auto relative overflow-visible">
                        {/* Header: Logo + Nav + Social + Enter — wraps naturally */}
                        <div className="flex items-start gap-3">
                            {/* Logo */}
                            <Link to="/" className="flex-shrink-0">
                                <Logo
                                    className="w-20 h-20 object-contain"
                                    mainColor="rgb(var(--dark))"
                                    shadeColor="rgb(var(--accent-strong))"
                                />
                            </Link>
                            {/* Nav + Social + Enter — wraps into rows as needed */}
                            <div className="flex-1 flex flex-wrap gap-1 items-center justify-end pt-1">
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
                                                className=""
                                            >
                                                <Icon className="w-full h-full" />
                                            </Button>
                                        ),
                                    )}
                                <Button
                                    as="a"
                                    href={LINKS.enter}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    variant="iconText"
                                    size={null}
                                    className="bg-[rgb(var(--primary-strong))] text-dark hover:!bg-[rgb(var(--primary-strong)/0.8)] hover:!text-dark hover:[&>*]:!text-dark"
                                >
                                    <span className="font-headline text-xs font-black uppercase tracking-wider">
                                        {authCopy.enterButton}
                                    </span>
                                    <ExternalLinkIcon className="w-3 h-3" />
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            </header>

            {/* Main Content - Full Bleed */}
            <main className="relative z-10 w-full min-h-screen pb-[70vh] lg:pb-[50vh] pt-48 lg:pt-40">
                <div key={location.pathname} className="animate-fade-in">
                    <Outlet />
                </div>
            </main>

            {/* Floating Glassy Footer */}
            <footer
                className={`fixed bottom-0 left-0 right-0 z-40 transition-transform duration-300 will-change-transform ${
                    showFooter ? "translate-y-0" : "translate-y-full"
                }`}
            >
                {/* Mobile/Tablet: Simplified footer */}
                <div className="lg:hidden">
                    <div className="w-full px-4 py-3">
                        <div className="max-w-4xl mx-auto flex flex-col gap-3">
                            <div className="flex items-center justify-center">
                                <div className="flex items-center">
                                    <SocialIcons />
                                </div>
                            </div>
                            <div className="flex items-center justify-center gap-2">
                                <FooterLinks
                                    layoutCopy={layoutCopy}
                                    emailCopied={emailCopied}
                                    onCopyEmail={handleCopyEmail}
                                />
                                <EnterButton
                                    isLoggedIn={isLoggedIn}
                                    authCopy={authCopy}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Desktop: Single line footer */}
                <div className="hidden lg:block w-full px-4 py-2">
                    <div className="max-w-4xl mx-auto">
                        <div className="flex items-center justify-between gap-4">
                            {/* Left: Branding Text */}
                            <div className="text-left flex-shrink-0">
                                <p className="font-headline text-[7px] font-black text-dark uppercase tracking-wider">
                                    {layoutCopy.footerBranding}
                                </p>
                                <p className="font-body text-[9px] text-dark">
                                    {layoutCopy.footerTagline}
                                </p>
                            </div>

                            {/* Center: Links */}
                            <div className="flex items-center flex-shrink-0 gap-2">
                                <FooterLinks
                                    layoutCopy={layoutCopy}
                                    emailCopied={emailCopied}
                                    onCopyEmail={handleCopyEmail}
                                />
                            </div>

                            {/* Right: Social + Enter */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    <SocialIcons />
                                </div>
                                <EnterButton
                                    isLoggedIn={isLoggedIn}
                                    authCopy={authCopy}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </footer>
        </div>
    );
}

export default Layout;
