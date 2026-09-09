import PropTypes from "prop-types";
import { useState } from "react";
import MemoizedMessageContent from "./MemoizedMessageContent";
import MessageAttachments from "./MessageAttachments";
import ThinkingProcess from "./ThinkingProcess";
import TypewriterEffect from "./TypewriterEffect";
import "./styles/BYOPModal.css";

const MediaMeta = ({ label, value }) =>
    value ? (
        <div className="media-meta-row">
            <span className="media-meta-label">{label}</span>
            <span className="media-meta-value">{value}</span>
        </div>
    ) : null;

const MessageBubble = ({
    message,
    displayContent,
    displayReasoning,
    isThinking,
    hasReasoning,
    attachmentsToRender,
    getAttachmentUrl,
    copyToClipboard,
    onRegenerate,
    isGenerating,
    scrollToBottom,
}) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        copyToClipboard(displayContent || message.content || "");
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div
            className={`message-bubble ${message.role} ${message.isStreaming ? "streaming" : ""} ${message.isError ? "error" : ""}`}
        >
            <MessageAttachments
                attachments={attachmentsToRender}
                getAttachmentUrl={getAttachmentUrl}
            />

            {/* Generated image */}
            {message.imageUrl && (
                <div className="media-card image-card">
                    <img
                        src={message.imageUrl}
                        alt={message.imagePrompt || "Generated image"}
                        className="media-card-img"
                        loading="lazy"
                    />
                    {(message.imagePrompt || message.imageModel) && (
                        <div className="media-card-meta">
                            <MediaMeta
                                label="Prompt"
                                value={message.imagePrompt}
                            />
                            <MediaMeta
                                label="Model"
                                value={message.imageModel}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Generated video */}
            {message.videoUrl && (
                <div className="media-card video-card">
                    <video
                        src={message.videoUrl}
                        className="media-card-video"
                        controls
                        loop
                        muted
                        playsInline
                    />
                    {(message.videoPrompt || message.videoModel) && (
                        <div className="media-card-meta">
                            <MediaMeta
                                label="Prompt"
                                value={message.videoPrompt}
                            />
                            <MediaMeta
                                label="Model"
                                value={message.videoModel}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Generated audio */}
            {message.audioUrl && (
                <div className="media-card audio-card">
                    <div className="audio-card-header">
                        <div className="audio-card-icon">
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M9 18V5l12-2v13M9 18a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3zM21 16a3 3 0 01-3 3 3 3 0 01-3-3 3 3 0 013-3 3 3 0 013 3z" />
                            </svg>
                        </div>
                        <div className="audio-card-info">
                            <span className="audio-card-title">
                                Generated Audio
                            </span>
                            {message.audioVoice && (
                                <span className="audio-card-voice">
                                    Voice: {message.audioVoice}
                                </span>
                            )}
                        </div>
                    </div>
                    <audio
                        src={message.audioUrl}
                        controls
                        className="audio-player"
                    />
                    {message.audioText && (
                        <div className="audio-transcript">
                            <span className="audio-transcript-label">Text</span>
                            <span className="audio-transcript-text">
                                {message.audioText}
                            </span>
                        </div>
                    )}
                    {message.audioModel && (
                        <div className="media-card-meta">
                            <MediaMeta
                                label="Model"
                                value={message.audioModel}
                            />
                        </div>
                    )}
                </div>
            )}

            {/* Assistant text content */}
            {message.role === "assistant" ? (
                <>
                    {hasReasoning && (
                        <ThinkingProcess
                            isThinking={isThinking}
                            content={displayReasoning}
                        />
                    )}

                    {message.isError ? (
                        <div className="simple-error">
                            <svg
                                className="error-icon"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <circle cx="12" cy="12" r="10" />
                                <line x1="12" y1="8" x2="12" y2="12" />
                                <line x1="12" y1="16" x2="12.01" y2="16" />
                            </svg>
                            <div className="simple-error-body">
                                <span>{message.content}</span>
                                {(message.errorType === "auth" ||
                                    message.errorType === "balance") && (
                                    <div className="message-byop-prompt">
                                        <button
                                            type="button"
                                            className="message-byop-btn"
                                            onClick={() =>
                                                window.openBYOPModal?.()
                                            }
                                        >
                                            Use your own API key (BYOP)
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : message.isStreaming ? (
                        <div className="message-content streaming-content">
                            <TypewriterEffect
                                content={displayContent}
                                isStreaming={true}
                                onComplete={scrollToBottom}
                            />
                        </div>
                    ) : displayContent ? (
                        <div className="message-content">
                            <MemoizedMessageContent content={displayContent} />
                        </div>
                    ) : null}
                </>
            ) : (
                /* User message */
                <div className="message-content">{message.content ?? ""}</div>
            )}

            {/* Message action bar (assistant only, not streaming, not error) */}
            {message.role === "assistant" &&
                !message.isStreaming &&
                !message.isError &&
                (displayContent ||
                    message.imageUrl ||
                    message.videoUrl ||
                    message.audioUrl) && (
                    <div className="message-actions">
                        {displayContent && (
                            <button
                                className={`message-action-btn ${copied ? "copied" : ""}`}
                                onClick={handleCopy}
                                title="Copy message"
                                aria-label="Copy message to clipboard"
                            >
                                {copied ? (
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <svg
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <rect
                                            x="9"
                                            y="9"
                                            width="13"
                                            height="13"
                                            rx="2"
                                        />
                                        <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                                    </svg>
                                )}
                                <span className="action-label">
                                    {copied ? "Copied!" : "Copy"}
                                </span>
                            </button>
                        )}
                        <button
                            className="message-action-btn"
                            onClick={() => !isGenerating && onRegenerate()}
                            title="Regenerate"
                            disabled={isGenerating}
                            aria-label="Regenerate response"
                        >
                            <svg
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                            >
                                <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
                            </svg>
                            <span className="action-label">Regenerate</span>
                        </button>
                    </div>
                )}
        </div>
    );
};

MessageBubble.propTypes = {
    message: PropTypes.object.isRequired,
    displayContent: PropTypes.string,
    displayReasoning: PropTypes.string,
    isThinking: PropTypes.bool,
    hasReasoning: PropTypes.bool,
    attachmentsToRender: PropTypes.array,
    getAttachmentUrl: PropTypes.func.isRequired,
    copyToClipboard: PropTypes.func.isRequired,
    onRegenerate: PropTypes.func.isRequired,
    isGenerating: PropTypes.bool,
    scrollToBottom: PropTypes.func,
};

export default MessageBubble;
