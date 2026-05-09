import React, { useState, useRef, useEffect } from 'react';
import { useSpeech } from '../hooks/useSpeech';
import './styles/ChatInput.css';

const MODES = [
  { id: 'chat',    label: 'Chat',    icon: '💬' },
  { id: 'imagine', label: 'Image',   icon: '🖼️' },
  { id: 'video',   label: 'Video',   icon: '🎬' },
  { id: 'audio',   label: 'Audio',   icon: '🎵' },
];

const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

const ChatInput = ({
  onSend,
  isGenerating,
  onStop,
  setIsUserTyping = () => {},
  onGenerateImage,
  onGenerateVideo,
  onGenerateAudio,
  onModeChange,
  selectedModel,
  selectedImageModel,
  selectedVideoModel,
  selectedAudioModel,
  mode = 'chat',
  models = {},
  imageModels = {},
  videoModels = {},
  audioModels = {},
  modelsLoaded = false,
  onModelChange,
  onImageModelChange,
  onVideoModelChange,
  onAudioModelChange,
  onOpenGenerationOptions,
}) => {
  const [inputValue, setInputValue] = useState('');
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [selectedAttachment, setSelectedAttachment] = useState(null);
  const [modelSearchTerm, setModelSearchTerm] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [selectedVoice, setSelectedVoice] = useState('nova');
  const inputRef = useRef(null);
  const attachMenuRef = useRef(null);
  const modelDropdownRef = useRef(null);
  const fileInputRef = useRef(null);
  const dropZoneRef = useRef(null);
  const { isListening, startListening, stopListening, hasSpeechRecognition } = useSpeech();

  const getActiveModelId = () => {
    if (mode === 'imagine') return selectedImageModel;
    if (mode === 'video')   return selectedVideoModel;
    if (mode === 'audio')   return selectedAudioModel;
    return selectedModel;
  };

  const getActiveModelsMap = () => {
    if (mode === 'imagine') return imageModels;
    if (mode === 'video')   return videoModels;
    if (mode === 'audio')   return audioModels;
    return models;
  };

  const activeModelId  = getActiveModelId();
  const activeModelsMap = getActiveModelsMap();
  const modelLabel = activeModelsMap?.[activeModelId]?.description
    || activeModelsMap?.[activeModelId]?.name
    || activeModelId
    || 'Select model';

  // Auto-resize textarea
  useEffect(() => {
    const ta = inputRef.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = `${ta.scrollHeight}px`; }
  }, [inputValue]);

  useEffect(() => {
    if (isListening) setInputValue('Listening…');
    else if (inputValue === 'Listening…') setInputValue('');
  }, [isListening]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(e.target)) setIsAttachMenuOpen(false);
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target)) setIsModelDropdownOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const handleModeChange = (newMode) => {
    if (onModeChange) onModeChange(newMode);
    setInputValue('');
    inputRef.current?.focus();
  };

  const handleModelSelect = (modelId) => {
    if (mode === 'imagine')     onImageModelChange?.(modelId);
    else if (mode === 'video')  onVideoModelChange?.(modelId);
    else if (mode === 'audio')  onAudioModelChange?.(modelId);
    else                        onModelChange?.(modelId);
    setIsModelDropdownOpen(false);
  };

  const handleSend = () => {
    const trimmed = inputValue.trim();
    if ((!trimmed && !selectedAttachment) || isListening || isGenerating) return;

    if (mode === 'imagine' && trimmed) {
      onGenerateImage?.(trimmed);
      setInputValue('');
      setSelectedAttachment(null);
      setIsUserTyping(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    if (mode === 'video' && trimmed) {
      onGenerateVideo?.(trimmed);
      setInputValue('');
      setSelectedAttachment(null);
      setIsUserTyping(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    if (mode === 'audio' && trimmed) {
      onGenerateAudio?.(trimmed, { voice: selectedVoice, model: activeModelId });
      setInputValue('');
      setSelectedAttachment(null);
      setIsUserTyping(false);
      setTimeout(() => inputRef.current?.focus(), 0);
      return;
    }

    onSend({ text: inputValue, attachment: selectedAttachment });
    setInputValue('');
    if (selectedAttachment && fileInputRef.current) fileInputRef.current.value = '';
    setSelectedAttachment(null);
    setIsUserTyping(false);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    setIsUserTyping(true);
  };

  const handleMicClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening((transcript) => {
        setInputValue(transcript);
        setIsUserTyping(false);
        if (mode === 'chat') onSend({ text: transcript });
      });
    }
  };

  const handleFileChange = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = typeof e.target.result === 'string' ? e.target.result : '';
      const commaIdx = result.indexOf(',');
      const base64 = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
      const isImage = file.type.startsWith('image/');
      setSelectedAttachment({ file, preview: isImage ? result : null, base64, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, isImage });
    };
    reader.readAsDataURL(file);
    setIsAttachMenuOpen(false);
  };

  const handlePaste = (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) break;
        const reader = new FileReader();
        reader.onload = (ev) => {
          const result = typeof ev.target.result === 'string' ? ev.target.result : '';
          const commaIdx = result.indexOf(',');
          setSelectedAttachment({ file, preview: result, base64: commaIdx >= 0 ? result.slice(commaIdx + 1) : result, name: file.name || 'pasted-image.png', mimeType: file.type || 'image/png', size: file.size, isImage: true });
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); if (e.currentTarget === dropZoneRef.current) setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault(); e.stopPropagation(); setIsDragging(false);
    const file = e.dataTransfer?.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const result = typeof ev.target.result === 'string' ? ev.target.result : '';
      const commaIdx = result.indexOf(',');
      const isImage = file.type.startsWith('image/');
      setSelectedAttachment({ file, preview: isImage ? result : null, base64: commaIdx >= 0 ? result.slice(commaIdx + 1) : result, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size, isImage });
    };
    reader.readAsDataURL(file);
  };

  const getPlaceholder = () => {
    if (mode === 'imagine') return 'Describe the image you want to create…';
    if (mode === 'video')   return 'Describe the video you want to generate…';
    if (mode === 'audio')   return 'Enter text to convert to speech…';
    return 'Ask anything…';
  };

  const canSend = (inputValue.trim() || selectedAttachment) && !isGenerating && !isListening;

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
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/>
            </svg>
            <span>Drop file to attach</span>
          </div>
        </div>
      )}

      <div className="chat-input-inner">
        {/* Attachment preview */}
        {selectedAttachment && (
          <div className="attachment-preview-row">
            <div className="attachment-chip">
              {selectedAttachment.isImage && selectedAttachment.preview ? (
                <img src={selectedAttachment.preview} alt="Preview" className="attachment-chip-thumb" />
              ) : (
                <div className="attachment-chip-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                    <path d="M14 2v6h6"/>
                  </svg>
                </div>
              )}
              <span className="attachment-chip-name">{selectedAttachment.name}</span>
              <button className="attachment-chip-remove" onClick={() => { setSelectedAttachment(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} title="Remove">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          </div>
        )}

        <div className="input-card">
          {/* Mode pills */}
          <div className="mode-pills" role="tablist" aria-label="Chat modes">
            {MODES.map(m => (
              <button
                key={m.id}
                type="button"
                className={`mode-pill ${mode === m.id ? 'active' : ''}`}
                onClick={() => handleModeChange(m.id)}
                role="tab"
                aria-selected={mode === m.id}
                aria-label={`${m.label} mode`}
                title={`Switch to ${m.label} mode`}
              >
                <span className="mode-pill-icon">{m.icon}</span>
                <span className="mode-pill-label">{m.label}</span>
              </button>
            ))}
          </div>

          {/* Text area */}
          <textarea
            ref={inputRef}
            id="messageInput"
            className="chat-textarea"
            value={inputValue}
            onChange={(e) => { setInputValue(e.target.value); setIsUserTyping(e.target.value.length > 0); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={getPlaceholder()}
            rows="1"
            disabled={isGenerating || isListening}
            aria-label="Message input"
            aria-describedby="mode-description"
          />

          {/* Bottom toolbar */}
          <div className="input-toolbar">
            <div className="toolbar-left">
              {/* Model selector */}
              <div className="model-selector-wrapper" ref={modelDropdownRef}>
                <button
                  type="button"
                  className="model-chip"
                  onClick={() => { if (modelsLoaded) setIsModelDropdownOpen(v => !v); }}
                  disabled={!modelsLoaded}
                  title={modelLabel}
                >
                  <svg className="model-chip-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 010 14.14M4.93 4.93a10 10 0 000 14.14"/>
                  </svg>
                  <span className="model-chip-name">{modelLabel}</span>
                  <svg className="model-chip-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M6 9l6 6 6-6"/>
                  </svg>
                </button>
                {isModelDropdownOpen && (
                  <div className="model-dropdown-compact">
                    <div className="model-search-container">
                      <svg className="model-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                      <input
                        type="text"
                        className="model-search-input"
                        placeholder="Search models…"
                        value={modelSearchTerm}
                        onChange={(e) => setModelSearchTerm(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                      />
                      {modelSearchTerm && (
                        <button type="button" className="model-search-clear" onClick={() => setModelSearchTerm('')}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                        </button>
                      )}
                    </div>
                    <div className="model-options-container">
                      {Object.entries(activeModelsMap)
                        .filter(([k, m]) => (m.description || m.name || k).toLowerCase().includes(modelSearchTerm.toLowerCase()))
                        .map(([k, m]) => (
                          <button
                            key={k}
                            type="button"
                            className={`model-option-compact ${activeModelId === k ? 'active' : ''}`}
                            onClick={() => handleModelSelect(k)}
                          >
                            <span className="model-option-name">{m.description || m.name || k}</span>
                            {activeModelId === k && (
                              <svg className="model-option-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                            )}
                          </button>
                        ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Voice selector for audio mode */}
              {mode === 'audio' && (
                <select
                  className="voice-select"
                  value={selectedVoice}
                  onChange={(e) => setSelectedVoice(e.target.value)}
                  title="Select voice"
                  aria-label="Select voice for audio generation"
                >
                  {VOICES.map(v => <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>)}
                </select>
              )}

              {/* Generation options for image/video */}
              {(mode === 'imagine' || mode === 'video') && onOpenGenerationOptions && (
                <button type="button" className="toolbar-icon-btn" onClick={() => onOpenGenerationOptions(mode)} title="Generation options">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                    <circle cx="8" cy="6" r="2" fill="currentColor" stroke="none"/>
                    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/>
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
                  </svg>
                </button>
              )}

              {/* File attach */}
              <div className="attach-menu-wrapper" ref={attachMenuRef}>
                <button
                  type="button"
                  className="toolbar-icon-btn"
                  onClick={() => setIsAttachMenuOpen(v => !v)}
                  title="Attach file"
                  aria-label="Attach file"
                  aria-expanded={isAttachMenuOpen}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                {isAttachMenuOpen && (
                  <div className="attach-menu">
                    <button className="attach-menu-item" onClick={() => { fileInputRef.current?.click(); setIsAttachMenuOpen(false); }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6"/></svg>
                      <span>Upload File</span>
                    </button>
                  </div>
                )}
                <input ref={fileInputRef} type="file" accept="*/*" style={{ display: 'none' }} onChange={handleFileChange} />
              </div>
            </div>

            <div className="toolbar-right">
              {hasSpeechRecognition && mode === 'chat' && (
                <button
                  type="button"
                  className={`toolbar-icon-btn ${isListening ? 'listening' : ''}`}
                  onClick={handleMicClick}
                  disabled={isGenerating}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z"/>
                    <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8"/>
                  </svg>
                </button>
              )}
              {isGenerating ? (
                <button
                  className="send-btn stop-btn"
                  onClick={onStop}
                  title="Stop generation"
                  aria-label="Stop generation"
                  type="button"
                >
                  <svg viewBox="0 0 20 20" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="2"/></svg>
                </button>
              ) : (
                <button
                  className={`send-btn ${canSend ? 'ready' : ''}`}
                  onClick={handleSend}
                  disabled={!canSend}
                  title="Send message"
                  aria-label="Send message"
                  type="button"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/>
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
