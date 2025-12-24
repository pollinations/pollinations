import React from 'react';
import './ThemesModal.css';

const ThemesModal = ({ isOpen, onClose, onAccentChange }) => {
  const ACCENT_COLORS = [
    { name: 'Default Gradient', value: 'gradient' },
    { name: 'Blue', value: 'blue' },
    { name: 'Red', value: 'red' },
    { name: 'Green', value: 'green' },
    { name: 'Purple', value: 'purple' },
    { name: 'Orange', value: 'orange' }
  ];

  if (!isOpen) return null;

  return (
    <div className="themes-modal">
      <div className="themes-modal-overlay" onClick={onClose}></div>
      <div className="themes-modal-content">
        <div className="themes-modal-header">
          <h2>Customize Theme</h2>
          <button className="close-modal-btn" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>
        <div className="themes-modal-body">
          <div className="theme-section">
            <h3>Accent Color</h3>
            <p className="theme-section-desc">Choose a color for your message bubbles</p>
            <div className="theme-grid">
              {ACCENT_COLORS.map(color => (
                <button
                  key={color.value}
                  className="theme-card accent-selector"
                  data-accent={color.value}
                  onClick={() => {
                    onAccentChange(color.value);
                    onClose();
                  }}
                >
                  <div className={`theme-card-preview accent-${color.value}`}></div>
                  <span className="theme-card-label">{color.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ThemesModal;
