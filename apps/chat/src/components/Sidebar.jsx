import React, { useState, memo, useCallback, useRef, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import './Sidebar.css';

const Sidebar = memo(({
  chats,
  activeChatId,
  onChatSelect,
  onNewChat,
  onDeleteChat,
  onThemeToggle,
  onOpenSettings,
  isLoggedIn,
  apiKey,
  pollenBalance,
  isLoadingBalance,
  onLogin,
  onLogout
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDangerous: false
  });
  const sidebarRef = useRef(null);

  // Close sidebar when clicking outside or focus leaves
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (isExpanded && sidebarRef.current && !sidebarRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };

    const handleFocusOut = (event) => {
      // Small delay to allow focus to move to new element
      setTimeout(() => {
        if (isExpanded && sidebarRef.current && !sidebarRef.current.contains(document.activeElement)) {
          setIsExpanded(false);
        }
      }, 10);
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('focusout', handleFocusOut);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('focusout', handleFocusOut);
    };
  }, [isExpanded]);

  useEffect(() => {
    const toggleBodyBlur = () => {
      if (typeof window === 'undefined') return;
      if (isExpanded && window.innerWidth <= 768) {
        document.body.classList.add('sidebar-expanded-mobile');
      } else {
        document.body.classList.remove('sidebar-expanded-mobile');
      }
    };

    toggleBodyBlur();
    window.addEventListener('resize', toggleBodyBlur);

    return () => {
      document.body.classList.remove('sidebar-expanded-mobile');
      window.removeEventListener('resize', toggleBodyBlur);
    };
  }, [isExpanded]);

  const handleDeleteChat = useCallback((chatId, e) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: 'Delete Chat',
      message: 'Are you sure you want to delete this chat? This action cannot be undone.',
      onConfirm: () => onDeleteChat(chatId),
      isDangerous: true
    });
  }, [onDeleteChat]);

  const handleSettingsOpen = useCallback(() => {
    if (onOpenSettings) {
      onOpenSettings();
    }
    setIsExpanded(false);
  }, [onOpenSettings]);

  const handleHoverOpen = useCallback(() => {
    // Only expand on hover if the device supports hover
    if (window.matchMedia('(hover: hover)').matches && !isExpanded) {
      setIsExpanded(true);
    }
  }, [isExpanded]);

  return (
    <>
      {isExpanded && <div className="sidebar-overlay" onClick={() => setIsExpanded(false)} />}
      <aside
        ref={sidebarRef}
        className={`sidebar ${isExpanded ? 'expanded' : ''}`}
        onMouseEnter={handleHoverOpen}
      >
        <div className="sidebar-header">
          {isExpanded ? (
            <>
              <div className="sidebar-logo-full">
                <img src="/pollinations-chat-ui/logo-text.svg" alt="Pollinations" />
              </div>
              
              <button className="sidebar-toggle-btn expanded" onClick={() => setIsExpanded(!isExpanded)} title="Collapse sidebar">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2"/>
                  <path d="M9 3v18"/>
                </svg>
              </button>
            </>
          ) : (
            <button className="sidebar-icon-btn sidebar-toggle-icon" onClick={() => setIsExpanded(!isExpanded)} title="Expand sidebar">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2"/>
                <path d="M9 3v18"/>
              </svg>
            </button>
          )}
        </div>
        
        {isExpanded ? (
          <div className="sidebar-scrollable">
            <div className="sidebar-content">
              <button className="sidebar-btn" onClick={onNewChat} title="New chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span>New Chat</span>
              </button>

              <button className="sidebar-btn" onClick={onThemeToggle} title="Toggle theme">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
                </svg>
                <span>Toggle Theme</span>
              </button>

              <button className="sidebar-btn" onClick={handleSettingsOpen} title="Open settings">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span>Settings</span>
              </button>

              {/* BYOP Auth Section */}
              <div className="sidebar-auth-section">
                {isLoggedIn ? (
                  <>
                    <div className="sidebar-auth-info">
                      <div className="sidebar-auth-label">
                        🌸 Your Pollen
                        {pollenBalance !== null && !isLoadingBalance && typeof pollenBalance.totalBalance === 'number' && (
                          <span className="sidebar-auth-balance">
                            {pollenBalance.totalBalance.toFixed(2)}
                          </span>
                        )}
                        {isLoadingBalance && (
                          <span className="sidebar-auth-balance-loading">...</span>
                        )}
                      </div>
                      <div className="sidebar-auth-key">{apiKey.slice(0, 14)}...</div>
                    </div>
                    <button className="sidebar-btn sidebar-btn-secondary" onClick={onLogout} title="Disconnect your pollinations.ai account">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                        <polyline points="16 17 21 12 16 7"/>
                        <line x1="21" y1="12" x2="9" y2="12"/>
                      </svg>
                      <span>Disconnect account</span>
                    </button>
                  </>
                ) : (
                  <button className="sidebar-btn sidebar-btn-primary" onClick={onLogin} title="Connect your pollinations.ai account">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <path d="M12 16v-4M12 8h.01"/>
                    </svg>
                    <span>Connect your pollinations.ai account</span>
                  </button>
                )}
              </div>
            </div>
          
            <div className="chat-list">
              <h3 className="sidebar-section-title">Chats</h3>
              {chats.map(chat => (
                <div
                  key={chat.id}
                  className={`chat-item ${chat.id === activeChatId ? 'active' : ''}`}
                  onClick={() => onChatSelect(chat.id)}
                >
                  <div className="chat-item-title truncate">{chat.title}</div>
                  <button
                    className="chat-item-delete"
                    onClick={(e) => handleDeleteChat(chat.id, e)}
                    aria-label="Delete chat"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="sidebar-narrow-actions">
            <button className="sidebar-icon-btn" onClick={onNewChat} title="New chat">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14"/>
              </svg>
            </button>
            <button className="sidebar-icon-btn" onClick={onThemeToggle} title="Toggle theme">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
              </svg>
            </button>
            <button className="sidebar-icon-btn" onClick={handleSettingsOpen} title="Open settings">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
          </div>
        )}

      </aside>

    <ConfirmModal
      isOpen={confirmModal.isOpen}
      onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
      onConfirm={confirmModal.onConfirm}
      title={confirmModal.title}
      message={confirmModal.message}
      confirmText="Delete"
      cancelText="Cancel"
      isDangerous={confirmModal.isDangerous}
    />
    </>
  );
});

export default Sidebar;
