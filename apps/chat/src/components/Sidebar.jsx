import { memo, useCallback, useEffect, useRef, useState } from "react";
import ConfirmModal from "./ConfirmModal";
import "./styles/Sidebar.css";

const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "";
    const now = Date.now();
    const diff = now - new Date(timestamp).getTime();
    const min = Math.floor(diff / 60000);
    const hr = Math.floor(diff / 3600000);
    const day = Math.floor(diff / 86400000);
    if (min < 1) return "just now";
    if (min < 60) return `${min}m ago`;
    if (hr < 24) return `${hr}h ago`;
    if (day < 7) return `${day}d ago`;
    return new Date(timestamp).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
    });
};

const Sidebar = memo(
    ({
        chats = [],
        activeChatId,
        onChatSelect,
        onNewChat,
        onDeleteChat,
        onThemeToggle,
        theme = "dark",
        onOpenSettings,
        onExportChat,
        onClearAll,
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

        useEffect(() => {
            const handleClickOutside = (e) => {
                if (
                    isExpanded &&
                    sidebarRef.current &&
                    !sidebarRef.current.contains(e.target)
                ) {
                    setIsExpanded(false);
                }
            };
            if (isExpanded)
                document.addEventListener("mousedown", handleClickOutside);
            return () =>
                document.removeEventListener("mousedown", handleClickOutside);
        }, [isExpanded]);

        useEffect(() => {
            if (isExpanded && window.innerWidth <= 768) {
                document.body.classList.add("sidebar-expanded-mobile");
            } else {
                document.body.classList.remove("sidebar-expanded-mobile");
            }
            return () =>
                document.body.classList.remove("sidebar-expanded-mobile");
        }, [isExpanded]);

        const handleDeleteChat = useCallback(
            (chatId, e) => {
                e.stopPropagation();
                setConfirmModal({
                    isOpen: true,
                    title: "Delete Chat",
                    message: "Delete this chat? This action cannot be undone.",
                    onConfirm: () => onDeleteChat(chatId),
                    isDangerous: true,
                });
            },
            [onDeleteChat],
        );

        const handleSettingsOpen = useCallback(() => {
            onOpenSettings?.();
            setIsExpanded(false);
        }, [onOpenSettings]);

        const isDark = theme === "dark";

        const _NavBtn = ({ onClick, title, icon, label }) => (
            <button
                className="sidebar-nav-btn"
                onClick={onClick}
                title={title}
                type="button"
            >
                {icon}
                {isExpanded && <span>{label}</span>}
            </button>
        );

        return (
            <>
                {isExpanded && (
                    <div
                        className="sidebar-overlay"
                        onClick={() => setIsExpanded(false)}
                    />
                )}
                <aside
                    ref={sidebarRef}
                    className={`sidebar ${isExpanded ? "expanded" : ""}`}
                    onMouseEnter={() => {
                        if (
                            window.matchMedia("(hover: hover)").matches &&
                            !isExpanded
                        )
                            setIsExpanded(true);
                    }}
                >
                    {/* Header */}
                    <div className="sidebar-header">
                        {isExpanded ? (
                            <>
                                <div className="sidebar-logo">
                                    <div className="sidebar-logo-dot" />
                                    <span className="sidebar-logo-text">
                                        Pollinations
                                    </span>
                                </div>
                                <button
                                    className="sidebar-icon-btn sidebar-toggle-icon"
                                    onClick={() => setIsExpanded(false)}
                                    title="Collapse sidebar"
                                    aria-label="Collapse sidebar"
                                    aria-expanded="true"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <rect
                                            x="3"
                                            y="3"
                                            width="18"
                                            height="18"
                                            rx="2"
                                        />
                                        <path d="M9 3v18" />
                                    </svg>
                                </button>
                            </>
                        ) : (
                            <button
                                className="sidebar-icon-btn sidebar-toggle-icon"
                                onClick={() => setIsExpanded(true)}
                                title="Expand sidebar"
                                aria-label="Expand sidebar"
                                aria-expanded="false"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <rect
                                        x="3"
                                        y="3"
                                        width="18"
                                        height="18"
                                        rx="2"
                                    />
                                    <path d="M9 3v18" />
                                </svg>
                            </button>
                        )}
                    </div>

                    {isExpanded ? (
                        <div className="sidebar-scrollable">
                            {/* Actions */}
                            <div className="sidebar-actions">
                                <button
                                    className="sidebar-new-chat-btn"
                                    onClick={onNewChat}
                                    title="Start a new chat"
                                    aria-label="Start a new chat"
                                    type="button"
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    <span>New Chat</span>
                                </button>

                                <div className="sidebar-icon-row">
                                    <button
                                        className="sidebar-icon-btn sm"
                                        onClick={onThemeToggle}
                                        title={
                                            isDark
                                                ? "Switch to light mode"
                                                : "Switch to dark mode"
                                        }
                                        aria-label={
                                            isDark
                                                ? "Switch to light mode"
                                                : "Switch to dark mode"
                                        }
                                    >
                                        {isDark ? (
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <circle cx="12" cy="12" r="5" />
                                                <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                            </svg>
                                        ) : (
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                            </svg>
                                        )}
                                    </button>
                                    <button
                                        className="sidebar-icon-btn sm"
                                        onClick={handleSettingsOpen}
                                        title="Open settings"
                                        aria-label="Open settings"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.1a2 2 0 01-1-1.72v-.51a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                                            <circle cx="12" cy="12" r="3" />
                                        </svg>
                                    </button>
                                    {onExportChat && (
                                        <button
                                            className="sidebar-icon-btn sm"
                                            onClick={() => {
                                                onExportChat();
                                                setIsExpanded(false);
                                            }}
                                            title="Export chat"
                                            aria-label="Export chat"
                                        >
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                stroke="currentColor"
                                                strokeWidth="2"
                                            >
                                                <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3" />
                                            </svg>
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Chat list */}
                            <div className="chat-list">
                                {chats.length > 0 && (
                                    <div className="chat-list-header">
                                        <span className="sidebar-section-title">
                                            Chats
                                        </span>
                                        {onClearAll && (
                                            <button
                                                className="chat-list-clear-btn"
                                                onClick={() => {
                                                    onClearAll();
                                                }}
                                                title="Clear all chats"
                                            >
                                                Clear all
                                            </button>
                                        )}
                                    </div>
                                )}
                                {chats.length === 0 && (
                                    <div className="chat-list-empty">
                                        No chats yet
                                    </div>
                                )}
                                {chats.map((chat) => {
                                    const lastMsg =
                                        chat.messages?.[
                                            chat.messages.length - 1
                                        ];
                                    const ts =
                                        lastMsg?.timestamp || chat.createdAt;
                                    const isActive = chat.id === activeChatId;
                                    return (
                                        <div
                                            key={chat.id}
                                            className={`chat-item ${isActive ? "active" : ""}`}
                                            onClick={() => {
                                                onChatSelect(chat.id);
                                                setIsExpanded(false);
                                            }}
                                            role="button"
                                            tabIndex={0}
                                            aria-current={
                                                isActive ? "page" : undefined
                                            }
                                            onKeyDown={(e) => {
                                                if (
                                                    e.key === "Enter" ||
                                                    e.key === " "
                                                ) {
                                                    e.preventDefault();
                                                    onChatSelect(chat.id);
                                                    setIsExpanded(false);
                                                }
                                            }}
                                        >
                                            <div className="chat-item-body">
                                                <div className="chat-item-title truncate">
                                                    {chat.title || "New Chat"}
                                                </div>
                                                {ts && (
                                                    <div className="chat-item-time">
                                                        {formatRelativeTime(ts)}
                                                    </div>
                                                )}
                                            </div>
                                            <button
                                                className="chat-item-delete"
                                                onClick={(e) =>
                                                    handleDeleteChat(chat.id, e)
                                                }
                                                aria-label="Delete chat"
                                            >
                                                <svg
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                                                </svg>
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ) : (
                        /* Collapsed narrow actions */
                        <div className="sidebar-narrow-actions">
                            <button
                                className="sidebar-icon-btn"
                                onClick={onNewChat}
                                title="Start a new chat"
                                aria-label="Start a new chat"
                                type="button"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M12 5v14M5 12h14" />
                                </svg>
                            </button>
                            <button
                                className="sidebar-icon-btn"
                                onClick={onThemeToggle}
                                title={
                                    isDark
                                        ? "Switch to light mode"
                                        : "Switch to dark mode"
                                }
                                aria-label={
                                    isDark
                                        ? "Switch to light mode"
                                        : "Switch to dark mode"
                                }
                                type="button"
                            >
                                {isDark ? (
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <circle cx="12" cy="12" r="5" />
                                        <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                                    </svg>
                                ) : (
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                                    </svg>
                                )}
                            </button>
                            <button
                                className="sidebar-icon-btn"
                                onClick={handleSettingsOpen}
                                title="Open settings"
                                aria-label="Open settings"
                                type="button"
                            >
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.38a2 2 0 00-.73-2.73l-.15-.1a2 2 0 01-1-1.72v-.51a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
                                    <circle cx="12" cy="12" r="3" />
                                </svg>
                            </button>
                        </div>
                    )}
                </aside>

                <ConfirmModal
                    isOpen={confirmModal.isOpen}
                    onClose={() =>
                        setConfirmModal((p) => ({ ...p, isOpen: false }))
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
