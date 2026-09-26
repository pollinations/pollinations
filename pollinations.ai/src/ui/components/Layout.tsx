import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { AUTH_COPY } from "../../copy/content/auth";
import { LAYOUT, LAYOUT_NO_TRANSLATE } from "../../copy/content/layout";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useAuthState } from "../../hooks/useAuth";
import { useFooterVisibility } from "../../hooks/useFooterVisibility";
import { useHeaderVisibility } from "../../hooks/useHeaderVisibility";
import { usePageCopy } from "../../hooks/usePageCopy";
import { Logo } from "./Logo";
import { SceneBackground } from "./SceneBackground";
import { Button } from "./ui/button";
import { InlineLink } from "./ui/inline-link";

const tabKeys = [
    { path: "/", copyKey: "navHello" as const },
    { path: "/play", copyKey: "navPlay" as const },
    { path: "/apps", copyKey: "navApps" as const },
    { path: "/community", copyKey: "navCommunity" as const },
];

function SocialIcons() {
    return (
        <>
            <InlineLink
                as="a"
                href={SOCIAL_LINKS.github.url}
                title={SOCIAL_LINKS.github.label}
                showIcon={false}
                className="inline-flex h-7 w-7 items-center justify-center"
            >
                <SOCIAL_LINKS.github.icon className="w-full h-full" />
            </InlineLink>
            <InlineLink
                as="a"
                href={SOCIAL_LINKS.discord.url}
                title={SOCIAL_LINKS.discord.label}
                showIcon={false}
                className="inline-flex h-7 w-7 items-center justify-center"
            >
                <SOCIAL_LINKS.discord.icon className="w-full h-full" />
            </InlineLink>
            {Object.entries(SOCIAL_LINKS)
                .filter(([key]) => key !== "github" && key !== "discord")
                .map(([key, { url, icon: Icon, label }]) => (
                    <InlineLink
                        key={key}
                        as="a"
                        href={url}
                        title={label}
                        showIcon={false}
                        className="inline-flex h-7 w-7 items-center justify-center"
                    >
                        <Icon className="w-full h-full" />
                    </InlineLink>
                ))}
        </>
    );
}

function FooterLinks({ layoutCopy }: { layoutCopy: Record<string, string> }) {
    return (
        <>
            <InlineLink
                as={Link}
                to="/terms"
                size="footer"
                className="inline-flex items-center gap-1.5"
            >
                <span>{layoutCopy.termsLink}</span>
            </InlineLink>
            <InlineLink
                as={Link}
                to="/privacy"
                size="footer"
                className="inline-flex items-center gap-1.5"
            >
                <span>{layoutCopy.privacyLink}</span>
            </InlineLink>
            <InlineLink
                as={Link}
                to="/refunds"
                size="footer"
                className="inline-flex items-center gap-1.5"
            >
                <span>{layoutCopy.refundsLink}</span>
            </InlineLink>
        </>
    );
}

function EnterLink({
    isLoggedIn,
    authCopy,
}: {
    isLoggedIn: boolean;
    authCopy: Record<string, string>;
}) {
    return (
        <InlineLink
            as="a"
            href={LINKS.enter}
            size="footer"
            className="inline-flex items-center gap-1.5"
        >
            <span>
                {isLoggedIn ? authCopy.enterButton : authCopy.registerButton}
            </span>
        </InlineLink>
    );
}

function Layout() {
    const location = useLocation();
    const showFooter = useFooterVisibility();
    const showHeader = useHeaderVisibility();
    const { isLoggedIn } = useAuthState();
    const { copy: authCopy } = usePageCopy(AUTH_COPY);
    const { copy: layoutCopy } = usePageCopy(LAYOUT, LAYOUT_NO_TRANSLATE);

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
                                            <InlineLink
                                                key={key}
                                                as="a"
                                                href={url}
                                                title={label}
                                                showIcon={false}
                                                className="inline-flex h-7 w-7 items-center justify-center"
                                            >
                                                <Icon className="w-full h-full" />
                                            </InlineLink>
                                        ),
                                    )}
                                <InlineLink
                                    as="a"
                                    href={LINKS.enter}
                                    size="sm"
                                    className="inline-flex items-center gap-1.5"
                                >
                                    <span>{authCopy.enterButton}</span>
                                </InlineLink>
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
                                <FooterLinks layoutCopy={layoutCopy} />
                                <EnterLink
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
                                <p className="font-body text-xs font-bold text-dark">
                                    {layoutCopy.footerBranding}
                                </p>
                                <p className="font-body text-[11px] text-dark">
                                    {layoutCopy.footerTagline}
                                </p>
                            </div>

                            {/* Center: Links */}
                            <div className="flex items-center flex-shrink-0 gap-2">
                                <FooterLinks layoutCopy={layoutCopy} />
                            </div>

                            {/* Right: Social + Enter */}
                            <div className="flex items-center gap-3">
                                <div className="flex items-center">
                                    <SocialIcons />
                                </div>
                                <EnterLink
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
