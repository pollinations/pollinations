import "./ShortcutsModal.css";

const ShortcutsModal = ({ isOpen, onClose }) => {
    if (!isOpen) return null;

    const shortcuts = [
        { key: "Cmd/Ctrl + K", description: "Open command palette" },
        { key: "Cmd/Ctrl + N", description: "New chat" },
        { key: "Cmd/Ctrl + B", description: "Toggle sidebar" },
        { key: "Shift + L", description: "Toggle light/dark theme" },
        { key: "Escape", description: "Stop generation" },
        { key: "Enter", description: "Send message" },
        { key: "Shift + Enter", description: "New line" },
    ];

    return (
        <div className="shortcuts-modal-overlay" onClick={onClose}>
            <div
                className="shortcuts-modal"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="shortcuts-modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button
                        className="close-btn"
                        onClick={onClose}
                        aria-label="Close"
                    >
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>
                <div className="shortcuts-modal-content">
                    <ul className="shortcuts-list">
                        {shortcuts.map((shortcut, index) => (
                            <li key={index} className="shortcut-item">
                                <kbd className="shortcut-key">
                                    {shortcut.key}
                                </kbd>
                                <span className="shortcut-description">
                                    {shortcut.description}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

export default ShortcutsModal;
