import React, { useState, useRef, useEffect } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import './ChatInput.css';

const ChatInput = ({
  onSend,
  isGenerating,
  onStop,
  setIsUserTyping = () => {},
  onGenerateImage,
  onModeChange,
  selectedModel,
  selectedImageModel,
  mode = 'chat',
  models = {},
  imageModels = {},
  modelsLoaded = false,
  onModelChange,
  onImageModelChange
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const { isListening, startListening, stopListening, hasSpeechRecognition } = useSpeech();

  const isImagineMode = inputValue.includes('/imagine');
  const isCanvasMode = inputValue.includes('/code');
  const activeModelId = mode === 'imagine' ? selectedImageModel : selectedModel;
  const activeModelsMap = mode === 'imagine' ? imageModels : models;
  const modelLabel = activeModelsMap?.[activeModelId]?.name || activeModelId || 'Select model';

  const handleModelBadgeClick = () => {
    if (!modelsLoaded) return;
    setIsModelDropdownOpen(!isModelDropdownOpen);
  };

  const handleModelSelect = (modelId) => {
    if (mode === 'imagine') {
      onImageModelChange?.(modelId);
    } else {
      onModelChange?.(modelId);
    }
    setIsModelDropdownOpen(false);
  };

  useEffect(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, [inputValue]);

  useEffect(() => {
    if (isListening) {
      setInputValue('Listening...');
    } else if (inputValue === 'Listening...') {
      setInputValue('');
    }
  }, [isListening, inputValue]);

  // Close attach menu when clicking outside the menu area
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setIsAttachMenuOpen(false);
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(event.target)) {
        setIsModelDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Auto-focus input on mount and after sending
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSend = () => {
    const trimmedInput = inputValue.trim();
    if ((trimmedInput || selectedAttachment) && !isListening) {
      if (inputValue.trim().startsWith('/imagine ')) {
        const prompt = inputValue.trim().substring(9);
        if (prompt && onGenerateImage) {
          onGenerateImage(prompt);
          setInputValue('');
          setSelectedAttachment(null);
          setIsUserTyping(false);
          // Reset to chat mode after sending
          if (onModeChange) {
            onModeChange('chat');
          }
          // Refocus input after sending
          setTimeout(() => inputRef.current?.focus(), 0);
          return;
        }
      }

      // Pass both text and image data if present
      onSend({
        text: inputValue,
        attachment: selectedAttachment
      });
      
      setInputValue('');
      if (selectedAttachment) {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
      setSelectedAttachment(null);
      setIsUserTyping(false);
      // Reset to chat mode after sending
      if (onModeChange) {
        onModeChange('chat');
      }
      // Refocus input after sending
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
    setIsUserTyping(true);
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((transcript) => {
        setInputValue(transcript);
        setIsUserTyping(false);
        onSend({ text: transcript });
      });
    }
  };

  const handleFileUpload = () => {
    fileInputRef.current?.click();
    setIsAttachMenuOpen(false);
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const result = typeof e.target.result === 'string' ? e.target.result : '';
      const commaIndex = result.indexOf(',');
      const base64Data = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      const isImage = file.type.startsWith('image/');

      setSelectedAttachment({
        file,
        preview: isImage ? result : null,
        base64: base64Data,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        isImage
      });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = (event) => {
    const items = event.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        event.preventDefault();
        const file = item.getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = typeof e.target.result === 'string' ? e.target.result : '';
            const commaIndex = result.indexOf(',');
            const base64Data = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;

            setSelectedAttachment({
              file,
              preview: result,
              base64: base64Data,
              name: file.name || 'pasted-image.png',
              mimeType: file.type || 'image/png',
              size: file.size,
              isImage: true
            });
          };
          reader.readAsDataURL(file);
        }
        break;
      }
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget === dropZoneRef.current) {
      setIsDragging(false);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    const files = event.dataTransfer?.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = typeof e.target.result === 'string' ? e.target.result : '';
      const commaIndex = result.indexOf(',');
      const base64Data = commaIndex >= 0 ? result.slice(commaIndex + 1) : result;
      const isImage = file.type.startsWith('image/');

      setSelectedAttachment({
        file,
        preview: isImage ? result : null,
        base64: base64Data,
        name: file.name,
        mimeType: file.type || 'application/octet-stream',
        size: file.size,
        isImage
      });
    };
    reader.readAsDataURL(file);
  };

  const removeSelectedAttachment = () => {
    setSelectedAttachment(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleImageGen = () => {
    setInputValue('/imagine ');
    setIsAttachMenuOpen(false);
    if (onModeChange) {
      onModeChange('imagine');
    }
    inputRef.current?.focus();
  };

  const handleCanvas = () => {
    setInputValue('/code ');
    setIsAttachMenuOpen(false);
    if (onModeChange) {
      onModeChange('code');
    }
    inputRef.current?.focus();
  };

  return (
    <footer 
      className="chat-input-container"
      ref={dropZoneRef}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drop-overlay">
          <div className="drop-box">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Drop your file here</span>
          </div>
        </div>
      )}
      <div className="chat-input-inner">
        {/* Image Preview Above Input */}
        {selectedAttachment && (
          <div className="image-preview-above">
            <div className="image-preview-wrapper">
              {selectedAttachment.isImage && selectedAttachment.preview ? (
                <img src={selectedAttachment.preview} alt="Preview" className="image-preview-large" />
              ) : (
                <div className="file-preview-large">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                    <path d="M16 13H8" />
                    <path d="M16 17H8" />
                    <path d="M10 9H8" />
                  </svg>
                  <span className="file-preview-ext">
                    {selectedAttachment.name?.split('.').pop()?.toUpperCase() || 'FILE'}
                  </span>
                </div>
              )}
              <button className="image-preview-remove-large" onClick={removeSelectedAttachment} title="Remove attachment">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
              <div className="image-preview-name">{selectedAttachment.name}</div>
            </div>
          </div>
        )}
        
        <div className="chat-input-wrapper-modern">
          <div className="chatbar-top">
            <div className="chatbar-model-row">
              <div className="model-selector-wrapper" ref={modelDropdownRef}>
                <button
                  type="button"
                  className="model-chip"
                  onClick={handleModelBadgeClick}
                  disabled={!modelsLoaded}
                  title={modelsLoaded ? modelLabel : 'Loading models...'}
                >
                  <span className="model-chip-icon" aria-hidden="true">
                    {mode === 'imagine' ? '🖼️' : '🌀'}
                  </span>
                  <span className="model-chip-name">{modelLabel}</span>
                  <svg className="model-chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isModelDropdownOpen && (
                  <div className="model-dropdown-compact">
                    <div className="model-search-container">
                      <input
                        type="text"
                        className="model-search-input"
                        placeholder="Search models..."
                        value={modelSearchTerm}
                        onChange={(e) => setModelSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                      />
                      {modelSearchTerm && (
                        <button
                          type="button"
                          className="model-search-clear"
                          onClick={() => setModelSearchTerm('')}
                          aria-label="Clear search"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/>
                            <line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                      <svg className="model-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                      </svg>
                    </div>
                    <div className="model-options-container">
                      {Object.entries(activeModelsMap)
                        .filter(([key, model]) => 
                          (model.name || key).toLowerCase().includes(modelSearchTerm.toLowerCase())
                        )
                        .map(([key, model]) => (
                          <button
                            key={key}
                            type="button"
                            className={`model-option-compact ${activeModelId === key ? 'active' : ''}`}
                            onClick={() => handleModelSelect(key)}
                          >
                            {model.name || key}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {(isImagineMode || isCanvasMode) && (
              <div className="chatbar-tags">
                {isImagineMode && (
                  <div className="image-mode-tag">
                    <svg className="image-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="3" y="3" width="18" height="18" rx="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <path d="M21 15l-5-5L5 21"/>
                    </svg>
                    <span>Image</span>
                  </div>
                )}
                {isCanvasMode && (
                  <div className="canvas-mode-tag">
                    <svg className="canvas-mode-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                      <path d="M14 2v6h6M16 13H8m8 4H8m2-8H8"/>
                    </svg>
                    <span>Canvas</span>
                  </div>
                )}
              </div>
            )}
            <textarea
              ref={inputRef}
              id="messageInput"
              value={
                isImagineMode
                  ? inputValue.replace('/imagine ', '').replace('/imagine', '')
                  : isCanvasMode
                    ? inputValue.replace('/code ', '').replace('/code', '')
                    : inputValue
              }
              onChange={(event) => {
                const value = event.target.value;
                if (isImagineMode) {
                  setInputValue('/imagine ' + value);
                } else if (isCanvasMode) {
                  setInputValue('/code ' + value);
                } else {
                  setInputValue(value);
                }
                setIsUserTyping(value.length > 0);
                if (onModeChange) {
                  if (isImagineMode) {
                    onModeChange('imagine');
                  } else if (isCanvasMode) {
                    onModeChange('code');
                  } else {
                    onModeChange('chat');
                  }
                }
              }}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="Type your message here..."
              rows="1"
              className="chat-input-modern"
              disabled={isGenerating || isListening}
            />
          </div>

          <div className="chatbar-bottom">
            <div className="chatbar-left">
              <div className="attach-menu-wrapper" ref={attachMenuRef}>
                <button
                  className="input-icon-btn"
                  onClick={() => setIsAttachMenuOpen(!isAttachMenuOpen)}
                  title="Attach"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
                {isAttachMenuOpen && (
                  <div className="attach-menu">
                    <button className="attach-menu-item" onClick={handleFileUpload}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48" />
                      </svg>
                      <span>Upload File</span>
                    </button>
                    <button className="attach-menu-item" onClick={handleImageGen}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <path d="M21 15l-5-5L5 21" />
                      </svg>
                      <span>Image Generation</span>
                    </button>
                    <button className="attach-menu-item" onClick={handleCanvas}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
                        <path d="M14 2v6h6M16 13H8m8 4H8m2-8H8" />
                      </svg>
                      <span>Canvas (Code)</span>
                    </button>
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="*/*"
                  style={{ display: 'none' }}
                  onChange={handleFileChange}
                />
              </div>
            </div>

            <div className="chatbar-right">
              {hasSpeechRecognition && (
                <button
                  type="button"
                  className={`input-icon-btn ${isListening ? 'listening' : ''}`}
                  onClick={handleMicClick}
                  disabled={isGenerating}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                  </svg>
                </button>
              )}
              {isGenerating ? (
                <button className="send-btn-modern stop-btn" onClick={onStop} title="Stop generation" type="button">
                  <svg viewBox="0 0 20 20" fill="currentColor">
                    <rect x="5" y="5" width="10" height="10" rx="2" />
                  </svg>
                </button>
              ) : (
                <button
                  className="send-btn-modern"
                  onClick={handleSend}
                  disabled={!inputValue.trim() && !selectedAttachment}
                  title="Send message"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4.5 11.134a1 1 0 0 0 0 1.732l14 8a1 1 0 0 0 1.5-.866V3a1 1 0 0 0-1.5-.866l-14 8z" />
                    <path d="M10 13l9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default ChatInput;
