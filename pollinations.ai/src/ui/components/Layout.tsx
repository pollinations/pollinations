import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import lockupUrl from "../../../../packages/ui/src/brand/lockup-horizontal.svg";
import markUrl from "../../../../packages/ui/src/brand/mark.svg";
import { AUTH_COPY } from "../../copy/content/auth";
import { LAYOUT, LAYOUT_NO_TRANSLATE } from "../../copy/content/layout";
import { LINKS, SOCIAL_LINKS } from "../../copy/content/socialLinks";
import { useAuthState } from "../../hooks/useAuth";
import { usePageCopy } from "../../hooks/usePageCopy";
import "../../site.css";

const tabs = [
    { path: "/", copyKey: "navHello" },
    { path: "/play", copyKey: "navPlay" },
    { path: "/apps", copyKey: "navApps" },
    { path: "/community", copyKey: "navCommunity" },
] as const;

export default function Layout() {
    const { copy } = usePageCopy(LAYOUT, LAYOUT_NO_TRANSLATE);
    const { copy: authCopy } = usePageCopy(AUTH_COPY);
    const { isLoggedIn } = useAuthState();
    const { pathname } = useLocation();

    return (
        <div className="site-layout">
            <a className="site-skip-link" href="#site-content">
                {copy.skipToContent}
            </a>
            <header className="site-header site-chrome">
                <div className="site-width site-header-inner">
                    <Link to="/" aria-label="pollinations.ai">
                        <img src={markUrl} width="32" height="32" alt="" />
                    </Link>
                    <nav aria-label={copy.navigationLabel}>
                        {tabs.map(({ path, copyKey }) => (
                            <NavLink
                                key={path}
                                to={path}
                                end
                                className="site-nav-link"
                            >
                                {copy[copyKey]}
                            </NavLink>
                        ))}
                    </nav>
                    <div className="site-actions">
                        <a className="site-button" href={LINKS.enterDocs}>
                            {copy.navDocs}
                        </a>
                        <a className="site-button" href={LINKS.enter}>
                            {isLoggedIn
                                ? authCopy.enterLink
                                : authCopy.loginButton}
                        </a>
                    </div>
                </div>
            </header>
            <main id="site-content" tabIndex={-1} className="site-content">
                <div key={pathname}>
                    <Outlet />
                </div>
            </main>
            <footer className="site-footer site-chrome site-width">
                <div className="site-footer-brand">
                    <Link to="/" aria-label="pollinations.ai">
                        <img src={lockupUrl} width="211" height="27" alt="" />
                    </Link>
                    <p>{copy.footerTagline}</p>
                    <div className="site-social">
                        {Object.values(SOCIAL_LINKS).map(
                            ({ url, icon: Icon, label }) => (
                                <a
                                    key={label}
                                    href={url}
                                    aria-label={label}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    <Icon className="w-5 h-5" />
                                </a>
                            ),
                        )}
                    </div>
                    <small>{copy.footerBranding}</small>
                </div>
                <nav aria-label={copy.footerNavigationLabel}>
                    {tabs.map(({ path, copyKey }) => (
                        <Link key={path} to={path}>
                            {copy[copyKey]}
                        </Link>
                    ))}
                </nav>
                <nav aria-label={copy.resourcesLabel}>
                    <a href={LINKS.enterDocs}>{copy.navDocs}</a>
                    <a href={LINKS.enterModels}>{copy.modelsLink}</a>
                    <a href={LINKS.enter}>{authCopy.enterLink}</a>
                </nav>
                <nav aria-label={copy.legalLabel}>
                    <Link to="/terms">{copy.termsLink}</Link>
                    <Link to="/privacy">{copy.privacyLink}</Link>
                    <Link to="/refunds">{copy.refundsLink}</Link>
                </nav>
            </footer>
        </div>
    );
}
