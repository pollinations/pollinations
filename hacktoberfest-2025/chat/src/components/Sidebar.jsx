import React, { useState, memo, useCallback, useRef, useEffect } from 'react';
import ConfirmModal from './ConfirmModal';
import './Sidebar.css';

const Sidebar = memo(({ chats, activeChatId, onChatSelect, onNewChat, onDeleteChat, onThemeToggle }) => {
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

  return (
    <>
      {isExpanded && <div className="sidebar-overlay" onClick={() => setIsExpanded(false)} />}
      <aside ref={sidebarRef} className={`sidebar ${isExpanded ? 'expanded' : ''}`}>
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
            <button className="sidebar-icon-btn pollinations-logo" onClick={() => setIsExpanded(!isExpanded)} title="Expand sidebar">
              <img src="/pollinations-chat-ui/pollinations-logo.svg" alt="Pollinations" style={{ width: '32px', height: '32px' }} />
            </button>
          )}
        </div>
        
        {isExpanded && (
          <div className="sidebar-scrollable">
            <div className="sidebar-content">
              <button className="sidebar-btn" onClick={onNewChat} title="New chat">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                <span>New Chat</span>
              </button>
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
                  <div className="chat-item-meta">
                    {chat.messages.length} message{chat.messages.length !== 1 ? 's' : ''}
                  </div>
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
        )}

        {isExpanded && (
          <div className="sidebar-footer">
            <button className="sidebar-icon-btn" onClick={onThemeToggle} title="Toggle theme">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>
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
