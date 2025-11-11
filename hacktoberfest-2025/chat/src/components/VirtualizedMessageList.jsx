import React, { memo, useMemo } from 'react';
import { FixedSizeList as List } from 'react-window';
import { FixedSizeList as List } from 'react-window/dist/react-window.cjs';
import { formatMessage } from '../utils/markdown';
import './VirtualizedMessageList.css';

const MessageRow = memo(({ data, index, style }) => {
  const message = data.messages[index];
  const { onRegenerate, isGenerating } = data;
  
  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(String(text))
      .then(() => {
        if (window?.showToast) window.showToast("Copied to clipboard!", "info");
      })
      .catch((err) => {
        if (window?.showToast) window.showToast("Failed to copy: " + err.message, "error");
      });
  };

  return (
    <div style={style}>
      <div className={`message-row ${message.role}`}>
        <div className={`message-avatar ${message.role}`}>
          {message.role === 'user' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="8" r="5"/>
              <path d="M20 21a8 8 0 00-16 0"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          )}
        </div>
        
        <div className={`message-bubble ${message.role} ${message.isStreaming ? 'streaming' : ''} ${message.isError ? 'error' : ''}`}>
          <div 
            className="message-content"
            dangerouslySetInnerHTML={
              message.role === 'assistant' 
                ? { __html: formatMessage(message.content) }
                : undefined
            }
          >
            {message.role === 'user' && (
              <>
                {message.content && typeof message.content === 'object' && message.content.image && (
                  <div className="message-image">
                    <img src={message.content.image} alt="Uploaded" />
                  </div>
                )}
                {typeof message.content === 'string' ? message.content : message.content.text || ''}
              </>
            )}
          </div>
          <div className="message-timestamp">
            {formatTime(message.timestamp)}
          </div>
          
          {/* Action buttons for assistant messages */}
          {message.role === 'assistant' && !message.isStreaming && (
            <div className="message-actions">
              <button
                className="message-action-btn"
                onClick={() => copyToClipboard(message.content)}
                title="Copy message"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2"/>
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                </svg>
              </button>
              <button
                className="message-action-btn"
                onClick={() => !isGenerating && typeof onRegenerate === 'function' && onRegenerate()}
                title="Regenerate response"
                disabled={isGenerating || typeof onRegenerate !== 'function'}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});

const VirtualizedMessageList = ({ messages, isGenerating, onRegenerate }) => {
  const itemData = useMemo(() => ({
    messages,
    isGenerating,
    onRegenerate
  }), [messages, isGenerating, onRegenerate]);

  if (messages.length === 0) {
    return null;
  }

  return (
    <List
      height={600}
      itemCount={messages.length}
      itemSize={120}
      itemData={itemData}
      className="virtualized-message-list"
    >
      {MessageRow}
    </List>
  );
};

export default VirtualizedMessageList;
