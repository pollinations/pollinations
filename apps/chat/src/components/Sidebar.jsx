import { memo, useCallback, useEffect, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import "./Sidebar.css";

const Sidebar = memo(
    ({
        chats,
        activeChatId,
        onChatSelect,
        onNewChat,
        onDeleteChat,
        onThemeToggle,
        onOpenSettings,
        onExportChat,
        isLoggedIn,
        apiKey,
        pollenBalance,
        isLoadingBalance,
        profile,
        onLogin,
        onLogout,
    }) => {
        const [isExpanded, setIsExpanded] = useState(false);
        const [confirmModal, setConfirmModal] = useState({
            isOpen: false,
            title: "",
            message: "",
            onConfirm: null,
            isDangerous: false,
        });
        const sidebarRef = useRef(null);

        // Mobile blur effect when sidebar is expanded
        useEffect(() => {
            if (typeof window === "undefined") return;
            if (isExpanded && window.innerWidth <= 768) {
                document.body.classList.add("sidebar-expanded-mobile");
            } else {
                document.body.classList.remove("sidebar-expanded-mobile");
            }
            return () => {
                document.body.classList.remove("sidebar-expanded-mobile");
            };
        }, [isExpanded]);

        const handleDeleteChat = useCallback(
            (chatId, e) => {
                e.stopPropagation();
                setConfirmModal({
                    isOpen: true,
                    title: "Delete Chat",
                    message:
                        "Are you sure you want to delete this chat? This action cannot be undone.",
                    onConfirm: () => onDeleteChat(chatId),
                    isDangerous: true,
                });
            },
            [onDeleteChat],
        );

        const handleSettingsOpen = useCallback(() => {
            if (onOpenSettings) {
                onOpenSettings();
            }
        }, [onOpenSettings]);

        return (
            <>
                <aside
                    ref={sidebarRef}
                    className={`sidebar ${isExpanded ? "expanded" : ""}`}
                >
                    <div className="sidebar-header">
                        {isExpanded ? (
                            <>
                                <div className="sidebar-logo-full">
                                    <img
                                        src="/logo-text-black.svg"
                                        alt="pollinations.ai"
                                    />
                                </div>

                                <button
                                    type="button"
                                    className="sidebar-toggle-btn"
                                    onClick={() => setIsExpanded(false)}
                                    title="Close sidebar"
                                >
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="15 18 9 12 15 6" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <button
                                type="button"
                                className="sidebar-icon-btn sidebar-toggle-icon"
                                onClick={() => setIsExpanded(true)}
                                title="Open sidebar"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                >
                                    <polyline points="9 18 15 12 9 6" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {isExpanded ? (
                        <div className="sidebar-scrollable">
                            <div className="sidebar-content">
                                <button
                                    type="button"
                                    className="sidebar-btn"
                                    onClick={onNewChat}
                                    title="New chat"
                                >
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    <span>New Chat</span>
                                </button>

                                <button
                                    type="button"
                                    className="sidebar-btn"
                                    onClick={onThemeToggle}
                                    title="Toggle theme"
                                >
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                    </svg>
                                    <span>Toggle Theme</span>
                                </button>

                                <button
                                    type="button"
                                    className="sidebar-btn"
                                    onClick={handleSettingsOpen}
                                    title="Open settings"
                                >
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                                        <circle cx="12" cy="12" r="3" />
                                    </svg>
                                    <span>Settings</span>
                                </button>

                                {onExportChat && (
                                    <button
                                        type="button"
                                        className="sidebar-btn"
                                        onClick={onExportChat}
                                        title="Export current chat"
                                    >
                                        <svg
                                            aria-hidden="true"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                            <polyline points="7 10 12 15 17 10" />
                                            <line
                                                x1="12"
                                                y1="15"
                                                x2="12"
                                                y2="3"
                                            />
                                        </svg>
                                        <span>Export Chat</span>
                                    </button>
                                )}

                                {/* BYOP Auth Section */}
                                <div className="sidebar-auth-section">
                                    {isLoggedIn ? (
                                        <div className="sidebar-auth-card sidebar-auth-card--active">
                                            <div className="sidebar-auth-card-row">
                                                <div className="sidebar-auth-avatar">
                                                    {profile?.image ? (
                                                        <img
                                                            src={profile.image}
                                                            alt={
                                                                profile.name ||
                                                                "User"
                                                            }
                                                            className="sidebar-auth-avatar-img"
                                                            onError={(e) => {
                                                                e.currentTarget.style.display =
                                                                    "none";
                                                                e.currentTarget.nextSibling.style.display =
                                                                    "flex";
                                                            }}
                                                        />
                                                    ) : null}
                                                    <span
                                                        className="sidebar-auth-avatar-initials"
                                                        style={
                                                            profile?.image
                                                                ? {
                                                                      display:
                                                                          "none",
                                                                  }
                                                                : {}
                                                        }
                                                    >
                                                        {profile?.name ? (
                                                            profile.name
                                                                .trim()
                                                                .split(/\s+/)
                                                                .map(
                                                                    (w) => w[0],
                                                                )
                                                                .slice(0, 2)
                                                                .join("")
                                                                .toUpperCase()
                                                        ) : (
                                                            <svg
                                                                aria-hidden="true"
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                            >
                                                                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                                                <circle
                                                                    cx="12"
                                                                    cy="7"
                                                                    r="4"
                                                                />
                                                            </svg>
                                                        )}
                                                    </span>
                                                </div>
                                                <div className="sidebar-auth-details">
                                                    <div className="sidebar-auth-name">
                                                        {profile?.name ||
                                                            "Connected"}
                                                    </div>
                                                    {profile?.email && (
                                                        <div className="sidebar-auth-email">
                                                            {profile.email}
                                                        </div>
                                                    )}
                                                    {!profile?.email && (
                                                        <div className="sidebar-auth-key">
                                                            {apiKey.slice(
                                                                0,
                                                                16,
                                                            )}
                                                            …
                                                        </div>
                                                    )}
                                                </div>
                                                {profile?.displayTier && (
                                                    <span className="sidebar-auth-tier-badge">
                                                        {profile.displayTier}
                                                    </span>
                                                )}
                                            </div>
                                            {(pollenBalance !== null ||
                                                isLoadingBalance) && (
                                                <div className="sidebar-auth-balance-row">
                                                    <span className="sidebar-auth-balance-label">
                                                        🌸 Pollen
                                                    </span>
                                                    {isLoadingBalance ? (
                                                        <span className="sidebar-auth-balance-loading">
                                                            loading…
                                                        </span>
                                                    ) : typeof pollenBalance?.totalBalance ===
                                                      "number" ? (
                                                        <span className="sidebar-auth-balance-value">
                                                            {pollenBalance.totalBalance.toFixed(
                                                                2,
                                                            )}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            )}
                                            <button
                                                type="button"
                                                className="sidebar-btn sidebar-btn-secondary sidebar-btn-sm"
                                                onClick={onLogout}
                                                title="Disconnect your pollinations.ai account"
                                            >
                                                <svg
                                                    aria-hidden="true"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                                                    <polyline points="16 17 21 12 16 7" />
                                                    <line
                                                        x1="21"
                                                        y1="12"
                                                        x2="9"
                                                        y2="12"
                                                    />
                                                </svg>
                                                <span>Disconnect</span>
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="sidebar-auth-card">
                                            <div className="sidebar-auth-card-header">
                                                <svg
                                                    aria-hidden="true"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                    className="sidebar-auth-card-icon"
                                                >
                                                    <circle
                                                        cx="12"
                                                        cy="12"
                                                        r="10"
                                                    />
                                                    <path d="M12 8v4l3 3" />
                                                </svg>
                                                <span className="sidebar-auth-card-title">
                                                    Unlock more models
                                                </span>
                                            </div>
                                            <p className="sidebar-auth-card-desc">
                                                Sign in with your Pollinations
                                                account to access your personal
                                                API key and model list.
                                            </p>
                                            <button
                                                type="button"
                                                className="sidebar-btn sidebar-btn-signin"
                                                onClick={onLogin}
                                                title="Sign in with your pollinations.ai account"
                                            >
                                                <svg
                                                    aria-hidden="true"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                                    <polyline points="10 17 15 12 10 7" />
                                                    <line
                                                        x1="15"
                                                        y1="12"
                                                        x2="3"
                                                        y2="12"
                                                    />
                                                </svg>
                                                <span>
                                                    Sign in with Pollinations
                                                </span>
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div className="chat-list">
                                <h3 className="sidebar-section-title">Chats</h3>
                                {chats.map((chat) => (
                                    <div
                                        key={chat.id}
                                        className={`chat-item ${chat.id === activeChatId ? "active" : ""}`}
                                    >
                                        <button
                                            type="button"
                                            className="chat-item-select"
                                            onClick={() =>
                                                onChatSelect(chat.id)
                                            }
                                        >
                                            <span className="chat-item-title truncate">
                                                {chat.title}
                                            </span>
                                        </button>
                                        <button
                                            type="button"
                                            className="chat-item-delete"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleDeleteChat(chat.id, e);
                                            }}
                                            aria-label="Delete chat"
                                        >
                                            <svg
                                                aria-hidden="true"
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                            </svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div className="sidebar-narrow-actions">
                            <button
                                type="button"
                                className="sidebar-icon-btn"
                                onClick={onNewChat}
                                title="New chat"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className="sidebar-icon-btn"
                                onClick={onThemeToggle}
                                title="Toggle theme"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className="sidebar-icon-btn"
                                onClick={handleSettingsOpen}
                                title="Open settings"
                            >
                                <svg
                                    aria-hidden="true"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </button>
                            <button
                                type="button"
                                className={`sidebar-icon-btn sidebar-auth-narrow-btn ${isLoggedIn ? "sidebar-auth-narrow-btn--active" : ""}`}
                                onClick={isLoggedIn ? onLogout : onLogin}
                                title={
                                    isLoggedIn
                                        ? "Connected — click to disconnect"
                                        : "Sign in with Pollinations"
                                }
                            >
                                {isLoggedIn ? (
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                                        <circle cx="12" cy="7" r="4" />
                                    </svg>
                                ) : (
                                    <svg
                                        aria-hidden="true"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                        <polyline points="10 17 15 12 10 7" />
                                        <line x1="15" y1="12" x2="3" y2="12" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    )}
                </aside>

                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() =>
                        setConfirmModal({ ...confirmModal, isOpen: false })
                    }
                    onConfirm={confirmModal.onConfirm}
                    title={confirmModal.title}
                    message={confirmModal.message}
                    confirmText="Delete"
                    cancelText="Cancel"
                    isDangerous={confirmModal.isDangerous}
                />
            </>
        );
    },
);

export default Sidebar;
