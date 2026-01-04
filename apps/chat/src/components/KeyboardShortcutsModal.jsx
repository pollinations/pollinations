import React from "react";
import "./KeyboardShortcutsModal.css";

const KeyboardShortcutsModal = ({ isOpen, onClose }) => {
    const shortcuts = [
        { keys: ["Ctrl", "K"], description: "Focus message input" },
        { keys: ["Ctrl", "N"], description: "New chat" },
        { keys: ["Ctrl", "B"], description: "Toggle sidebar" },
        { keys: ["Ctrl", "Shift", "L"], description: "Toggle dark mode" },
        { keys: ["Enter"], description: "Send message" },
        { keys: ["Shift", "Enter"], description: "New line" },
        { keys: ["Esc"], description: "Close modal" },
    ];

    if (!isOpen) return null;

    return (
        <div className="themes-modal">
            <div className="themes-modal-overlay" onClick={onClose}></div>
            <div className="themes-modal-content">
                <div className="themes-modal-header">
                    <h2>Keyboard Shortcuts</h2>
                    <button className="close-modal-btn" onClick={onClose}>
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    </button>
                </div>
                <div className="themes-modal-body">
                    <div className="shortcuts-list">
                        {shortcuts.map((shortcut, index) => (
                            <div key={index} className="shortcut-item">
                                <div className="shortcut-keys">
                                    {shortcut.keys.map((key, i) => (
                                        <React.Fragment key={i}>
                                            {i > 0 && (
                                                <span className="shortcut-plus">
                                                    {" "}
                                                    +{" "}
                                                </span>
                                            )}
                                            <kbd>{key}</kbd>
                                        </React.Fragment>
                                    ))}
                                </div>
                                <div className="shortcut-desc">
                                    {shortcut.description}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default KeyboardShortcutsModal;
