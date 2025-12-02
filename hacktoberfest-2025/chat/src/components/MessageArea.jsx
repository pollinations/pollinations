import React, { useEffect, useRef, useState, useCallback } from 'react';
import { formatMessage, formatStreamingMessage } from '../utils/markdown';
import MemoizedMessageContent from './MemoizedMessageContent';
import ThinkingProcess from './ThinkingProcess';
import './MessageArea.css';

const MessageArea = ({ messages, isGenerating, isUserTyping, onRegenerate }) => {
  const messagesEndRef = useRef(null);
  const [welcomeMessage, setWelcomeMessage] = useState('');
  const [expandedErrors, setExpandedErrors] = useState({});

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    // Select a random welcome message when component mounts or messages become empty
    const welcomeMessages = [
      "What can I help with today?",
      "What's on your mind?",
      "How can I assist you?",
      "What are we creating today?",
      "Ask me anything.",
      "Ready to explore ideas?",
      "What would you like to know?",
      "Let's make something amazing!",
      "How may I help you?",
      "What brings you here today?"
    ];
    setWelcomeMessage(welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)]);
  }, [messages.length]);

  const copyToClipboard = useCallback((text) => {
    navigator.clipboard.writeText(text)
      .then(() => {
        if (window?.showToast) window.showToast("Copied to clipboard!", "info");
      })
      .catch((err) => {
        if (window?.showToast) window.showToast("Failed to copy: " + err.message, "error");
      });
  }, []);

  const toggleErrorDetails = useCallback((messageId) => {
    setExpandedErrors(prev => ({
      ...prev,
      [messageId]: !prev[messageId]
    }));
  }, []);

  const parseThinkTags = useCallback((text = '', isStreaming = false) => {
    if (!text) {
      return {
        cleanedContent: '',
        reasoningBlocks: [],
        pendingReasoning: ''
      };
    }

    const pattern = /<think>([\s\S]*?)(<\/think>|$)/gi;
    const blocks = [];
    const cleanedSegments = [];
    let pendingReasoning = '';
    let match;
    let lastIndex = 0;

    while ((match = pattern.exec(text)) !== null) {
      const leadingText = text.slice(lastIndex, match.index);
      if (leadingText) {
        cleanedSegments.push(leadingText);
      }

      const innerContent = match[1] || '';
      const hasClosingTag = Boolean(match[2] && match[2].toLowerCase() === '</think>');

      if (hasClosingTag) {
        const trimmedReasoning = innerContent.trim();
        if (trimmedReasoning) {
          blocks.push(trimmedReasoning);
        }
      } else if (isStreaming) {
        // Only capture pending reasoning if the message is actively streaming
        pendingReasoning = innerContent;
      }

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      cleanedSegments.push(text.slice(lastIndex));
    }

    const cleanedContent = cleanedSegments.join('');

    return {
      cleanedContent,
      reasoningBlocks: blocks,
      pendingReasoning: pendingReasoning.trim()
    };
  }, []);

  const getAttachmentUrl = useCallback((attachment) => {
    if (!attachment) return null;
    if (typeof attachment.preview === 'string') return attachment.preview;
    if (typeof attachment.src === 'string') return attachment.src;
    if (attachment.data) {
      const mime = attachment.mimeType || attachment.type || 'application/octet-stream';
      return `data:${mime};base64,${attachment.data}`;
    }
    return null;
  }, []);

  if (messages.length === 0 && !isGenerating) {
    return (
      <main className="messages-area messages-area-empty">
        <div className="welcome-screen">
          <h1 className="welcome-text" key={welcomeMessage}>{welcomeMessage}</h1>
        </div>
      </main>
    );
  }

  return (
    <main className="messages-area">
      <div className="messages-container">
        {messages.map((message) => {
          const { cleanedContent, reasoningBlocks, pendingReasoning } = parseThinkTags(message.content || '', message.isStreaming);
          const reasoningSegments = [];

          if (message.reasoning && message.reasoning.trim()) {
            reasoningSegments.push(message.reasoning.trim());
          }

          if (reasoningBlocks.length) {
            reasoningSegments.push(...reasoningBlocks);
          }

          // Only show pending reasoning if message is actively streaming
          if (message.isStreaming && pendingReasoning) {
            reasoningSegments.push(pendingReasoning);
          }

          const displayReasoning = reasoningSegments
            .map(segment => segment.trim())
            .filter(Boolean)
            .filter((segment, index, array) => array.indexOf(segment) === index)
            .join('\n\n');

          const displayContent = message.role === 'assistant'
            ? (cleanedContent || '')
            : (message.content || '');

          const hasReasoning = Boolean(displayReasoning);
          const isThinking = message.isStreaming && pendingReasoning;

          const attachmentsArray = Array.isArray(message.attachments) ? message.attachments : [];
          const legacyAttachments = attachmentsArray.length === 0 && message.image && message.image.src
            ? [{
                name: message.image.name,
                preview: message.image.src,
                mimeType: message.image.mimeType || (message.image.src?.startsWith('data:') ? message.image.src.split(';')[0].replace('data:', '') : 'image/png'),
                isImage: true
              }]
            : [];
          const attachmentsToRender = attachmentsArray.length ? attachmentsArray : legacyAttachments;

          return (
            <div key={message.id} className={`message-row ${message.role}`}>
              <div className={`message-bubble ${message.role} ${message.isStreaming ? 'streaming' : ''} ${message.isError ? 'error' : ''}`}>
                {/* Display uploaded attachments if present (user messages) */}
                {attachmentsToRender.length > 0 && (
                  <div className="message-attachments">
                    {attachmentsToRender.map((attachment, index) => {
                      const isImageAttachment = attachment.isImage ?? (attachment.mimeType ? attachment.mimeType.startsWith('image/') : false);
                      const attachmentUrl = getAttachmentUrl(attachment);

                      if (isImageAttachment && attachmentUrl) {
                        return (
                          <div className="message-image-container" key={`${message.id}-attachment-${index}`}>
                            <img
                              src={attachmentUrl}
                              alt={attachment.name || 'Uploaded image'}
                              className="message-image"
                              loading="lazy"
                            />
                            {attachment.name && (
                              <div className="image-name">
                                {attachment.name}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="message-file-attachment" key={`${message.id}-attachment-${index}`}>
                          <div className="message-file-icon" aria-hidden="true">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                              <path d="M14 2v6h6" />
                              <path d="M16 13H8" />
                              <path d="M16 17H8" />
                              <path d="M10 9H8" />
                            </svg>
                          </div>
                          <div className="message-file-details">
                            <div className="message-file-name">{attachment.name || 'Attachment'}</div>
                            {attachment.mimeType && (
                              <div className="message-file-meta">{attachment.mimeType}</div>
                            )}
                          </div>
                          {attachmentUrl && (
                            <a
                              className="message-file-download"
                              href={attachmentUrl}
                              download={attachment.name || 'attachment'}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M12 5v14" />
                                <path d="M5 12l7 7 7-7" />
                                <path d="M5 19h14" />
                              </svg>
                            </a>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
                
                {/* Display generated image if present (assistant messages) */}
                {message.imageUrl && (
                  <div className={`message-image-container ${!message.imageUrl.startsWith('data:') ? 'loading' : ''}`}>
                    <img
                      src={message.imageUrl}
                      alt={message.imagePrompt || 'Generated image'}
                      className="message-image"
                      loading="lazy"
                    />
                    {message.imagePrompt && (
                      <div className="image-prompt">
                        <strong>Prompt:</strong> {message.imagePrompt}
                      </div>
                    )}
                    {message.imageModel && (
                      <div className="image-model">
                        <strong>Model:</strong> {message.imageModel}
                      </div>
                    )}
                  </div>
                )}

                {/* Display generated video if present (assistant messages) */}
                {message.videoUrl && (
                  <div className={`message-video-container ${!message.videoUrl.startsWith('data:') ? 'loading' : ''}`}>
                    <video
                      src={message.videoUrl}
                      className="message-video"
                      controls
                      loop
                      muted
                      playsInline
                    />
                    {message.videoPrompt && (
                      <div className="video-prompt">
                        <strong>Prompt:</strong> {message.videoPrompt}
                      </div>
                    )}
                    {message.videoModel && (
                      <div className="video-model">
                        <strong>Model:</strong> {message.videoModel}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Display text content */}
                {message.role === 'assistant' ? (
                  <>
                    {/* Show reasoning if present */}
                    {hasReasoning && (
                      <ThinkingProcess 
                        isThinking={isThinking} 
                        content={displayReasoning} 
                      />
                    )}
                    
                    {message.isError ? (
                      <div className="simple-error">
                        <svg className="error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="12" y1="8" x2="12" y2="12"/>
                          <line x1="12" y1="16" x2="12.01" y2="16"/>
                        </svg>
                        <span>{message.content}</span>
                      </div>
                    ) : message.isStreaming ? (
                      <div
                        className="message-content streaming-content"
                        dangerouslySetInnerHTML={{ __html: formatStreamingMessage(displayContent) }}
                      />
                    ) : (
                      <div className="message-content">
                        <MemoizedMessageContent content={displayContent} />
                      </div>
                    )}
                  </>
                ) : (
                  <div className="message-content">
                    {message.content ?? ''}
                  </div>
                )}
                
                {/* Action buttons for assistant messages */}
                {message.role === 'assistant' && !message.isStreaming && !message.isError && (
                  <div className="message-actions">
                    <button
                      className="message-action-btn"
                      onClick={() => copyToClipboard(displayContent || message.content || '')}
                      title="Copy message"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="9" y="9" width="13" height="13" rx="2"/>
                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/>
                      </svg>
                      <span className="action-label">Copy</span>
                    </button>
                    <button
                      className="message-action-btn"
                      onClick={() => !isGenerating && onRegenerate()}
                      title="Regenerate response"
                      disabled={isGenerating}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16"/>
                      </svg>
                      <span className="action-label">Regenerate</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        
        
        {isGenerating && (messages.length === 0 || messages[messages.length - 1]?.role !== 'assistant' || !messages[messages.length - 1]?.isStreaming) && (
          <div className="message-row assistant">
            <div className="message-avatar assistant">
              <img src="pollinations-logo.svg" alt="AI" className="ai-logo" />
            </div>
            <div className="message-bubble assistant">
              <ThinkingProcess isThinking={true} content="" />
            </div>
          </div>
        )}
        {isUserTyping && messages[messages.length - 1]?.role !== 'user' && (
          <div className="message-row user">
            <div className="message-avatar user">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="5"/>
                <path d="M20 21a8 8 0 00-16 0"/>
              </svg>
            </div>
            <div className="message-bubble user">
              <div className="typing-indicator">
                <div className="typing-dot"></div>
              </div>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>
    </main>
  );
};

export default MessageArea;
