import PropTypes from "prop-types";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageBubble from "./MessageBubble";
import ThinkingProcess from "./ThinkingProcess";
import "./styles/MessageArea.css";

const MessageArea = ({
    messages,
    isGenerating,
    isUserTyping,
    onRegenerate,
}) => {
    const messagesEndRef = useRef(null);
    const [welcomeMessage, setWelcomeMessage] = useState("");
    const [_expandedErrors, _setExpandedErrors] = useState({});

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
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
            "What brings you here today?",
        ];
        setWelcomeMessage(
            welcomeMessages[Math.floor(Math.random() * welcomeMessages.length)],
        );
    }, [messages.length]);

    const copyToClipboard = useCallback((text) => {
        if (!text) return;
        navigator.clipboard
            .writeText(text)
            .then(() => {
                if (window?.showToast)
                    window.showToast("Copied to clipboard!", "info");
            })
            .catch((err) => {
                if (window?.showToast)
                    window.showToast(`Failed to copy: ${err.message}`, "error");
            });
    }, []);

    const parseThinkTags = useCallback((text = "", isStreaming = false) => {
        if (!text) {
            return {
                cleanedContent: "",
                reasoningBlocks: [],
                pendingReasoning: "",
            };
        }

        const pattern = /<think>([\s\S]*?)(<\/think>|$)/gi;
        const blocks = [];
        const cleanedSegments = [];
        let pendingReasoning = "";
        let match;
        let lastIndex = 0;

        while ((match = pattern.exec(text)) !== null) {
            const leadingText = text.slice(lastIndex, match.index);
            if (leadingText) {
                cleanedSegments.push(leadingText);
            }

            const innerContent = match[1] || "";
            const hasClosingTag = Boolean(
                match[2] && match[2].toLowerCase() === "</think>",
            );

            if (hasClosingTag) {
                const trimmedReasoning = innerContent.trim();
                if (trimmedReasoning) {
                    blocks.push(trimmedReasoning);
                }
            } else if (isStreaming) {
                pendingReasoning = innerContent;
            }

            lastIndex = match.index + match[0].length;
        }

        if (lastIndex < text.length) {
            cleanedSegments.push(text.slice(lastIndex));
        }

        const cleanedContent = cleanedSegments.join("");

        return {
            cleanedContent,
            reasoningBlocks: blocks,
            pendingReasoning: pendingReasoning.trim(),
        };
    }, []);

    const getAttachmentUrl = useCallback((attachment) => {
        if (!attachment) return null;
        if (typeof attachment.preview === "string") return attachment.preview;
        if (typeof attachment.src === "string") return attachment.src;
        if (attachment.data) {
            const mime =
                attachment.mimeType ||
                attachment.type ||
                "application/octet-stream";
            return `data:${mime};base64,${attachment.data}`;
        }
        return null;
    }, []);

    if (messages.length === 0 && !isGenerating) {
        return (
            <main className="messages-area messages-area-empty">
                <div className="welcome-screen">
                    <div className="welcome-logo">
                        <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                        >
                            <path
                                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"
                                strokeWidth="0"
                                fill="currentColor"
                                opacity="0.2"
                            />
                            <circle cx="12" cy="12" r="3" fill="currentColor" />
                            <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" />
                        </svg>
                    </div>
                    <h1 className="welcome-text" key={welcomeMessage}>
                        {welcomeMessage}
                    </h1>
                    <p className="welcome-sub">
                        Powered by Pollinations AI — generate text, images,
                        video & audio
                    </p>
                    <div className="welcome-feature-grid">
                        <div className="welcome-feature-card">
                            <span className="welcome-feature-icon">💬</span>
                            <div className="welcome-feature-text">
                                <span className="welcome-feature-title">
                                    Chat
                                </span>
                                <span className="welcome-feature-desc">
                                    GPT-4, Claude, Gemini & more
                                </span>
                            </div>
                        </div>
                        <div className="welcome-feature-card">
                            <span className="welcome-feature-icon">🖼️</span>
                            <div className="welcome-feature-text">
                                <span className="welcome-feature-title">
                                    Images
                                </span>
                                <span className="welcome-feature-desc">
                                    Flux, DALL·E & more
                                </span>
                            </div>
                        </div>
                        <div className="welcome-feature-card">
                            <span className="welcome-feature-icon">🎬</span>
                            <div className="welcome-feature-text">
                                <span className="welcome-feature-title">
                                    Video
                                </span>
                                <span className="welcome-feature-desc">
                                    AI-generated video clips
                                </span>
                            </div>
                        </div>
                        <div className="welcome-feature-card">
                            <span className="welcome-feature-icon">🎵</span>
                            <div className="welcome-feature-text">
                                <span className="welcome-feature-title">
                                    Audio
                                </span>
                                <span className="welcome-feature-desc">
                                    Text-to-speech, 6 voices
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            </main>
        );
    }

    return (
        <main className="messages-area">
            <div className="messages-container">
                {messages.map((message) => {
                    const {
                        cleanedContent,
                        reasoningBlocks,
                        pendingReasoning,
                    } = parseThinkTags(
                        message.content || "",
                        message.isStreaming,
                    );
                    const reasoningSegments = [];

                    if (message.reasoning?.trim()) {
                        reasoningSegments.push(message.reasoning.trim());
                    }

                    if (reasoningBlocks.length) {
                        reasoningSegments.push(...reasoningBlocks);
                    }

                    if (message.isStreaming && pendingReasoning) {
                        reasoningSegments.push(pendingReasoning);
                    }

                    const displayReasoning = reasoningSegments
                        .map((segment) => segment.trim())
                        .filter(Boolean)
                        .filter(
                            (segment, index, array) =>
                                array.indexOf(segment) === index,
                        )
                        .join("\n\n");

                    const displayContent =
                        message.role === "assistant"
                            ? cleanedContent || ""
                            : message.content || "";

                    const hasReasoning = Boolean(displayReasoning);
                    const isThinking = message.isStreaming && pendingReasoning;

                    const attachmentsArray = Array.isArray(message.attachments)
                        ? message.attachments
                        : [];
                    const legacyAttachments =
                        attachmentsArray.length === 0 &&
                        message.image &&
                        message.image.src
                            ? [
                                  {
                                      name: message.image.name,
                                      preview: message.image.src,
                                      mimeType:
                                          message.image.mimeType ||
                                          (message.image.src?.startsWith(
                                              "data:",
                                          )
                                              ? message.image.src
                                                    .split(";")[0]
                                                    .replace("data:", "")
                                              : "image/png"),
                                      isImage: true,
                                  },
                              ]
                            : [];
                    const attachmentsToRender = attachmentsArray.length
                        ? attachmentsArray
                        : legacyAttachments;

                    return (
                        <div
                            key={message.id}
                            className={`message-row ${message.role}`}
                        >
                            <MessageBubble
                                message={message}
                                displayContent={displayContent}
                                displayReasoning={displayReasoning}
                                isThinking={isThinking}
                                hasReasoning={hasReasoning}
                                attachmentsToRender={attachmentsToRender}
                                getAttachmentUrl={getAttachmentUrl}
                                copyToClipboard={copyToClipboard}
                                onRegenerate={onRegenerate}
                                isGenerating={isGenerating}
                                scrollToBottom={scrollToBottom}
                            />
                        </div>
                    );
                })}

                {isGenerating &&
                    (messages.length === 0 ||
                        messages[messages.length - 1]?.role !== "assistant" ||
                        !messages[messages.length - 1]?.isStreaming) && (
                        <div className="message-row assistant">
                            <div className="message-avatar assistant">
                                <img
                                    src="pollinations-logo.svg"
                                    alt="AI"
                                    className="ai-logo"
                                />
                            </div>
                            <div className="message-bubble assistant">
                                <ThinkingProcess isThinking={true} content="" />
                            </div>
                        </div>
                    )}
                {isUserTyping &&
                    messages[messages.length - 1]?.role !== "user" && (
                        <div className="message-row user">
                            <div className="message-avatar user">
                                <svg
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                >
                                    <circle cx="12" cy="8" r="5" />
                                    <path d="M20 21a8 8 0 00-16 0" />
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

MessageArea.propTypes = {
    messages: PropTypes.array.isRequired,
    isGenerating: PropTypes.bool,
    isUserTyping: PropTypes.bool,
    onRegenerate: PropTypes.func.isRequired,
};

export default MessageArea;
