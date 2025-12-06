import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import './ChatHeader.css';

const ChatHeader = ({
  onMenuToggle,
  selectedModel,
  onModelChange,
  selectedImageModel,
  onImageModelChange,
  sidebarOpen,
  models = {},
  imageModels = {},
  modelsLoaded = false,
  mode = 'chat'
}) => {
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const modelDropdownRef = useRef(null);

  // Memoize current models based on mode
  const currentModels = useMemo(() => {
    return mode === 'imagine' ? imageModels : models;
  }, [mode, imageModels, models]);

  // Memoize current selected model
  const currentSelectedModel = useMemo(() => {
    return mode === 'imagine' ? selectedImageModel : selectedModel;
  }, [mode, selectedImageModel, selectedModel]);

  // Memoize current model name
  const currentModelName = useMemo(() => {
    return currentModels[currentSelectedModel]?.name || 'Loading...';
  }, [currentModels, currentSelectedModel]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleModelSelect = useCallback((key) => {
    if (mode === 'imagine') {
      onImageModelChange(key);
    } else {
      onModelChange(key);
    }
    setIsModelDropdownOpen(false);
  }, [mode, onImageModelChange, onModelChange]);

  return (
    <header className="chat-header">
      <div className="header-left">
        <button className={`header-icon-btn menu-toggle ${sidebarOpen ? 'open' : ''}`} onClick={onMenuToggle}>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
          <span className="hamburger-line"></span>
        </button>
      </div>
      
      <div className="header-center">
        <div className="model-selector-wrapper" ref={modelDropdownRef}>
          <button className="model-selector" onClick={() => setIsModelDropdownOpen(!isModelDropdownOpen)}>
            <span className="model-label">{mode === 'imagine' ? '🎨' : '💬'}</span>
            <span id="currentModelName">{currentModelName}</span>
            <svg className="model-selector-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6"/>
            </svg>
          </button>
          {isModelDropdownOpen && (
            <div className="model-dropdown">
              <div className="model-dropdown-search">
                <input
                  type="text"
                  placeholder={mode === 'imagine' ? "Search image models..." : "Search text models..."}
                />
              </div>
              <div className="model-list">
                {Object.entries(currentModels).map(([key, model]) => (
                  <button
                    key={key}
                    className={`model-option ${currentSelectedModel === key ? 'active' : ''}`}
                    onClick={() => handleModelSelect(key)}
                  >
                    {model.name}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="header-right">
      </div>
    </header>
  );
};

export default ChatHeader;
