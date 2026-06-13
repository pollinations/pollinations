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
    const [dismissedNotes, setDismissedNotes] = useState(new Set());
    const dismissNote = (key) =>
        setDismissedNotes((prev) => new Set([...prev, key]));

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

            {/* Context transparency log (stormdede515-eng)
                Confirmed drops (severity=drop) and soft advisories
                (severity=warning) are rendered separately so the user
                can tell the difference between a proven failure and a
                heads-up that may or may not apply. */}
            {message.role === "assistant" &&
                Array.isArray(message.contextDrops) &&
                message.contextDrops.length > 0 &&
                (() => {
                    const drops = message.contextDrops.filter(
                        (d) => d.severity === "drop",
                    );
                    const warnings = message.contextDrops.filter(
                        (d) => d.severity === "warning",
                    );
                    const renderReason = (entry) => {
                        switch (entry.reason) {
                            case "model-no-vision":
                                return `You sent an image to a text-only model — ${entry.detail?.model || "this model"} doesn't accept images. Switch to a vision-capable model.`;
                            case "no-data":
                                return `The image data was lost before it reached the model — platform-side failure, not your error. Try re-attaching the file.`;
                            case "no-explicit-prompt":
                                return `Image sent without a text prompt — the model will decide how to respond on its own. Add a question or instruction if you want a specific outcome.`;
                            case "model-ignored-image":
                                return "The model supports vision but didn't use it — this is a model-side failure, not your error. Try re-sending or switching to a different model.";
                            case "unexpected-drop":
                                return `${entry.detail?.missed} of ${entry.detail?.expected} image(s) were lost somewhere in the pipeline — platform-side failure. Try re-attaching.`;
                            case "image-in-prior-turn":
                                return "Some models don't look back at images from earlier turns. If the model seems to have missed it, re-attach the image to your next message.";
                            default:
                                return entry.reason;
                        }
                    };

                    const faultSuffix = (entries) => {
                        if (!entries.length) return "";
                        const first = entries[0].detail?.fault;
                        if (!first || first === "none") return "";
                        const allSame = entries.every(e => e.detail?.fault === first);
                        if (!allSame) return "";
                        if (first === "user") return " — check your model selection";
                        if (first === "model") return " — model did not process it";
                        if (first === "platform") return " — platform pipeline issue";
                        return "";
                    };
                    return (
                        <>
                            {drops.length > 0 && !dismissedNotes.has("drops") && (
                                <details className="context-drop-log context-drop-log--error">
                                    <summary className="context-drop-summary">
                                        <svg className="context-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                            <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                            <line x1="12" y1="9" x2="12" y2="13" />
                                            <line x1="12" y1="17" x2="12.01" y2="17" />
                                        </svg>
                                        {drops.length === 1 ? "1 item was not seen by the AI" : `${drops.length} items were not seen by the AI`}{faultSuffix(drops)}
                                        <button type="button" className="context-note-dismiss" aria-label="Dismiss" onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissNote("drops"); }}>×</button>
                                    </summary>
                                    <ul className="context-drop-list">
                                        {drops.map((d, i) => (
                                            <li key={i} className="context-drop-item">
                                                <span className="context-drop-type">{d.type}</span>
                                                <span className="context-drop-reason">{renderReason(d)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                            {warnings.length > 0 && !dismissedNotes.has("warnings") && (
                                <details className="context-drop-log context-drop-log--warn">
                                    <summary className="context-drop-summary">
                                        <svg className="context-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                            <circle cx="12" cy="12" r="10" />
                                            <line x1="12" y1="8" x2="12" y2="12" />
                                            <line x1="12" y1="16" x2="12.01" y2="16" />
                                        </svg>
                                        {warnings.length === 1 ? "1 advisory note about this request" : `${warnings.length} advisory notes about this request`}
                                        <button type="button" className="context-note-dismiss" aria-label="Dismiss" onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissNote("warnings"); }}>×</button>
                                    </summary>
                                    <ul className="context-drop-list">
                                        {warnings.map((w, i) => (
                                            <li key={i} className="context-drop-item">
                                                <span className="context-drop-type">{w.type}</span>
                                                <span className="context-drop-reason">{renderReason(w)}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </details>
                            )}
                        </>
                    );
                })()}

            {/* Conversation integrity note (stormdede515-eng)
                Shown when the user's message referenced something the AI
                supposedly said but the claim isn't found in conversation
                history. Advisory only — never blocks the message. */}
            {message.role === "assistant" && message.integrityNote && !dismissedNotes.has("integrity") && (() => {
                const { phrase, claimText, matchCount, totalKeywords } = message.integrityNote;
                const snippet = claimText && claimText.length > 60
                    ? `${claimText.slice(0, 60)}…`
                    : claimText || "";
                return (
                    <details className="context-drop-log context-integrity-note">
                        <summary className="context-drop-summary">
                            <svg className="context-drop-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <circle cx="12" cy="12" r="10" />
                                <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3" />
                                <line x1="12" y1="17" x2="12.01" y2="17" />
                            </svg>
                            Reference to prior AI output could not be verified
                            <button type="button" className="context-note-dismiss" aria-label="Dismiss" onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismissNote("integrity"); }}>×</button>
                        </summary>
                        <ul className="context-drop-list">
                            <li className="context-drop-item">
                                <span className="context-drop-type">claim</span>
                                <span className="context-drop-reason">
                                    {`"${phrase}${snippet ? ` ${snippet}` : ""}" — `}
                                    {totalKeywords === 0
                                        ? "the claim was too short to verify"
                                        : matchCount === 0
                                          ? "none of the key terms appear in any prior AI response in this conversation"
                                          : `only ${matchCount} of ${totalKeywords} key terms matched the conversation history`}
                                    . The AI will respond based on what was actually recorded.
                                </span>
                            </li>
                        </ul>
                    </details>
                );
            })()}

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
