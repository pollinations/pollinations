import React, { useEffect, useRef, useState, useCallback } from "react";
import { formatMessage, formatStreamingMessage } from "../utils/markdown";
import MemoizedMessageContent from "./MemoizedMessageContent";
import ThinkingProcess from "./ThinkingProcess";
import MediaLightbox from "./MediaLightbox";
import "./MessageArea.css";

const MessageArea = ({
    messages,
    isGenerating,
    isUserTyping,
    onRegenerate,
    onEditMessage,
    profile,
    chats = [],
}) => {
    const messagesEndRef = useRef(null);
    const [welcomeMessage, setWelcomeMessage] = useState("");
    const [expandedErrors, setExpandedErrors] = useState({});
    const [editingMessageId, setEditingMessageId] = useState(null);
    const [editingContent, setEditingContent] = useState("");
    const [lightboxData, setLightboxData] = useState({
        isOpen: false,
        src: null,
        type: "image",
    });

    const scrollContainerRef = useRef(null);
    const isUserScrolledUp = useRef(false);

    const handleScroll = useCallback(() => {
        if (!scrollContainerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } =
            scrollContainerRef.current;
        const distanceToBottom = scrollHeight - scrollTop - clientHeight;
        isUserScrolledUp.current = distanceToBottom > 150;
    }, []);

    const scrollToBottom = useCallback(() => {
        if (!isUserScrolledUp.current) {
            messagesEndRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "end",
            });
        }
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    useEffect(() => {
        const hour = new Date().getHours();
        const firstName = profile?.name?.trim().split(/\s+/)[0] || null;
        const namePart = firstName ? `, ${firstName}` : "";

        // Time-of-day greeting
        let timeGreeting;
        if (hour >= 5 && hour < 12) timeGreeting = `Good morning${namePart}`;
        else if (hour >= 12 && hour < 17)
            timeGreeting = `Good afternoon${namePart}`;
        else if (hour >= 17 && hour < 21)
            timeGreeting = `Good evening${namePart}`;
        else timeGreeting = `Hey${namePart}`;

        // Detect dominant topic from past chat titles
        const allTitles = chats
            .map((c) => (c.title || "").toLowerCase())
            .join(" ");

        const topics = [
            {
                keywords: [
                    "code",
                    "coding",
                    "debug",
                    "function",
                    "bug",
                    "error",
                    "api",
                    "javascript",
                    "python",
                    "typescript",
                    "react",
                    "css",
                    "html",
                    "sql",
                    "deploy",
                    "git",
                    "script",
                    "build",
                    "component",
                    "hook",
                    "regex",
                    "algorithm",
                    "refactor",
                ],
                messages: [
                    "Ready to write some code?",
                    `What are we building today${namePart}?`,
                    "Got a bug to squash or feature to build?",
                    "What should we code next?",
                    `Debugging or building something new${namePart}?`,
                ],
            },
            {
                keywords: [
                    "image",
                    "design",
                    "art",
                    "draw",
                    "generate",
                    "logo",
                    "icon",
                    "creative",
                    "photo",
                    "illustration",
                    "pixel",
                    "style",
                    "color",
                    "poster",
                ],
                messages: [
                    "What shall we create today?",
                    `What visual are you imagining${namePart}?`,
                    "Ready to generate something amazing?",
                    `Describe your vision${namePart}!`,
                ],
            },
            {
                keywords: [
                    "write",
                    "writing",
                    "story",
                    "essay",
                    "blog",
                    "content",
                    "copy",
                    "edit",
                    "draft",
                    "article",
                    "poem",
                    "script",
                    "email",
                    "summarize",
                    "translate",
                ],
                messages: [
                    "What are we writing today?",
                    `What should we craft${namePart}?`,
                    "Got a piece you want to write or refine?",
                    `Words at the ready${namePart}!`,
                ],
            },
            {
                keywords: [
                    "learn",
                    "study",
                    "explain",
                    "tutorial",
                    "course",
                    "research",
                    "topic",
                    "concept",
                    "how",
                    "why",
                    "understand",
                    "question",
                ],
                messages: [
                    "What would you like to explore?",
                    `Curious about something${namePart}?`,
                    "What are we diving into today?",
                    `What do you want to understand better${namePart}?`,
                ],
            },
            {
                keywords: [
                    "business",
                    "marketing",
                    "strategy",
                    "plan",
                    "product",
                    "pitch",
                    "startup",
                    "finance",
                    "analytics",
                    "sales",
                ],
                messages: [
                    "What business challenge are we tackling?",
                    `What are you working on${namePart}?`,
                    "Strategy, copy, or analysis — what do you need?",
                ],
            },
        ];

        let topicPick = null;
        if (allTitles.length > 0) {
            let bestScore = 0;
            for (const topic of topics) {
                const score = topic.keywords.reduce((acc, kw) => {
                    const re = new RegExp(`\\b${kw}`, "g");
                    return acc + (allTitles.match(re)?.length || 0);
                }, 0);
                if (score > bestScore) {
                    bestScore = score;
                    topicPick = topic;
                }
            }
        }

        const pool = topicPick
            ? topicPick.messages
            : [
                  `${timeGreeting}! What can I help with?`,
                  `${timeGreeting}! What's on your mind?`,
                  `${timeGreeting}! Ask me anything.`,
                  `${timeGreeting}! What are we creating today?`,
                  `${timeGreeting}! Ready when you are.`,
              ];

        // Prepend greeting to topic messages when user is known
        const finalPool =
            topicPick && firstName
                ? pool.map((m) => `${timeGreeting}! ${m}`)
                : topicPick
                  ? pool
                  : pool;

        setWelcomeMessage(
            finalPool[Math.floor(Math.random() * finalPool.length)],
        );
    }, [messages.length, profile, chats]);

    const copyToClipboard = useCallback((text) => {
        navigator.clipboard
            .writeText(text)
            .then(() => {
                if (window?.showToast)
                    window.showToast("Copied to clipboard!", "info");
            })
            .catch((err) => {
                if (window?.showToast)
                    window.showToast("Failed to copy: " + err.message, "error");
            });
    }, []);

    const toggleErrorDetails = useCallback((messageId) => {
        setExpandedErrors((prev) => ({
            ...prev,
            [messageId]: !prev[messageId],
        }));
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
                // Only capture pending reasoning if the message is actively streaming
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
            <>
                <main className="messages-area messages-area-empty">
                    <div className="welcome-screen">
                        <h1 className="welcome-text" key={welcomeMessage}>
                            {welcomeMessage}
                        </h1>
                    </div>
                </main>
                <MediaLightbox
                    isOpen={lightboxData.isOpen}
                    src={lightboxData.src}
                    type={lightboxData.type}
                    onClose={() =>
                        setLightboxData({
                            isOpen: false,
                            src: null,
                            type: "image",
                        })
                    }
                />
            </>
        );
    }

    return (
        <>
            <main
                className="messages-area"
                ref={scrollContainerRef}
                onScroll={handleScroll}
            >
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
                        const isThinking =
                            message.isStreaming && pendingReasoning;

                        const attachmentsArray = Array.isArray(
                            message.attachments,
                        )
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
                                <div
                                    className={`message-bubble ${message.role} ${message.isStreaming ? "streaming" : ""} ${message.isError ? "error" : ""}`}
                                >
                                    {/* Display uploaded attachments if present (user messages) */}
                                    {attachmentsToRender.length > 0 && (
                                        <div className="message-attachments">
                                            {attachmentsToRender.map(
                                                (attachment, index) => {
                                                    const isImageAttachment =
                                                        attachment.isImage ??
                                                        (attachment.mimeType
                                                            ? attachment.mimeType.startsWith(
                                                                  "image/",
                                                              )
                                                            : false);
                                                    const attachmentUrl =
                                                        getAttachmentUrl(
                                                            attachment,
                                                        );

                                                    if (
                                                        isImageAttachment &&
                                                        attachmentUrl
                                                    ) {
                                                        return (
                                                            <div
                                                                className="message-image-container"
                                                                key={`${message.id}-attachment-${index}`}
                                                            >
                                                                <img
                                                                    src={
                                                                        attachmentUrl
                                                                    }
                                                                    alt={
                                                                        attachment.name ||
                                                                        "Uploaded image"
                                                                    }
                                                                    className="message-image"
                                                                    loading="lazy"
                                                                />
                                                                {attachment.name && (
                                                                    <div className="image-name">
                                                                        {
                                                                            attachment.name
                                                                        }
                                                                    </div>
                                                                )}
                                                            </div>
                                                        );
                                                    }

                                                    return (
                                                        <div
                                                            className="message-file-attachment"
                                                            key={`${message.id}-attachment-${index}`}
                                                        >
                                                            <div
                                                                className="message-file-icon"
                                                                aria-hidden="true"
                                                            >
                                                                <svg
                                                                    viewBox="0 0 24 24"
                                                                    fill="none"
                                                                    stroke="currentColor"
                                                                    strokeWidth="2"
                                                                >
                                                                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                                                    <path d="M14 2v6h6" />
                                                                    <path d="M16 13H8" />
                                                                    <path d="M16 17H8" />
                                                                    <path d="M10 9H8" />
                                                                </svg>
                                                            </div>
                                                            <div className="message-file-details">
                                                                <div className="message-file-name">
                                                                    {attachment.name ||
                                                                        "Attachment"}
                                                                </div>
                                                                {attachment.mimeType && (
                                                                    <div className="message-file-meta">
                                                                        {
                                                                            attachment.mimeType
                                                                        }
                                                                    </div>
                                                                )}
                                                            </div>
                                                            {attachmentUrl && (
                                                                <a
                                                                    className="message-file-download"
                                                                    href={
                                                                        attachmentUrl
                                                                    }
                                                                    download={
                                                                        attachment.name ||
                                                                        "attachment"
                                                                    }
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                >
                                                                    <svg
                                                                        viewBox="0 0 24 24"
                                                                        fill="none"
                                                                        stroke="currentColor"
                                                                        strokeWidth="2"
                                                                    >
                                                                        <path d="M12 5v14" />
                                                                        <path d="M5 12l7 7 7-7" />
                                                                        <path d="M5 19h14" />
                                                                    </svg>
                                                                </a>
                                                            )}
                                                        </div>
                                                    );
                                                },
                                            )}
                                        </div>
                                    )}

                                    {/* Display generated image if present (assistant messages) */}
                                    {message.imageUrl && (
                                        <div
                                            className={`message-image-container ${!message.imageUrl.startsWith("data:") ? "loading" : ""}`}
                                        >
                                            <img
                                                src={message.imageUrl}
                                                alt={
                                                    message.imagePrompt ||
                                                    "Generated image"
                                                }
                                                className="message-image cursor-pointer"
                                                loading="lazy"
                                                onClick={() =>
                                                    setLightboxData({
                                                        isOpen: true,
                                                        src: message.imageUrl,
                                                        type: "image",
                                                    })
                                                }
                                                style={{ cursor: "pointer" }}
                                            />
                                            {message.imagePrompt && (
                                                <div className="image-prompt">
                                                    <strong>Prompt:</strong>{" "}
                                                    {message.imagePrompt}
                                                </div>
                                            )}
                                            {message.imageModel && (
                                                <div className="image-model">
                                                    <strong>Model:</strong>{" "}
                                                    {message.imageModel}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Display generated video if present (assistant messages) */}
                                    {message.videoUrl && (
                                        <div
                                            className={`message-video-container ${!message.videoUrl.startsWith("data:") ? "loading" : ""}`}
                                        >
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
                                                    <strong>Prompt:</strong>{" "}
                                                    {message.videoPrompt}
                                                </div>
                                            )}
                                            {message.videoModel && (
                                                <div className="video-model">
                                                    <strong>Model:</strong>{" "}
                                                    {message.videoModel}
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {/* Display text content */}
                                    {message.role === "assistant" ? (
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
                                                    <svg
                                                        className="error-icon"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                    >
                                                        <circle
                                                            cx="12"
                                                            cy="12"
                                                            r="10"
                                                        />
                                                        <line
                                                            x1="12"
                                                            y1="8"
                                                            x2="12"
                                                            y2="12"
                                                        />
                                                        <line
                                                            x1="12"
                                                            y1="16"
                                                            x2="12.01"
                                                            y2="16"
                                                        />
                                                    </svg>
                                                    <span>
                                                        {message.content}
                                                    </span>
                                                </div>
                                            ) : message.isStreaming ? (
                                                <div
                                                    className="message-content streaming-content"
                                                    dangerouslySetInnerHTML={{
                                                        __html: formatStreamingMessage(
                                                            displayContent,
                                                        ),
                                                    }}
                                                />
                                            ) : (
                                                <div className="message-content">
                                                    <MemoizedMessageContent
                                                        content={displayContent}
                                                    />
                                                </div>
                                            )}
                                        </>
                                    ) : (
                                        <>
                                            {editingMessageId === message.id ? (
                                                <div className="message-edit-container">
                                                    <textarea
                                                        className="message-edit-textarea"
                                                        value={editingContent}
                                                        onChange={(e) =>
                                                            setEditingContent(
                                                                e.target.value,
                                                            )
                                                        }
                                                        onKeyDown={(e) => {
                                                            if (
                                                                e.key ===
                                                                    "Enter" &&
                                                                !e.shiftKey
                                                            ) {
                                                                e.preventDefault();
                                                                if (
                                                                    editingContent.trim() &&
                                                                    onEditMessage
                                                                ) {
                                                                    onEditMessage(
                                                                        message.id,
                                                                        editingContent,
                                                                    );
                                                                    setEditingMessageId(
                                                                        null,
                                                                    );
                                                                }
                                                            }
                                                            if (
                                                                e.key ===
                                                                "Escape"
                                                            ) {
                                                                setEditingMessageId(
                                                                    null,
                                                                );
                                                            }
                                                        }}
                                                        autoFocus // eslint-disable-line jsx-a11y/no-autofocus
                                                        rows={3}
                                                    />
                                                    <div className="message-edit-actions">
                                                        <button
                                                            type="button"
                                                            className="message-edit-btn message-edit-btn--save"
                                                            onClick={() => {
                                                                if (
                                                                    editingContent.trim() &&
                                                                    onEditMessage
                                                                ) {
                                                                    onEditMessage(
                                                                        message.id,
                                                                        editingContent,
                                                                    );
                                                                    setEditingMessageId(
                                                                        null,
                                                                    );
                                                                }
                                                            }}
                                                        >
                                                            Save & Resend
                                                        </button>
                                                        <button
                                                            type="button"
                                                            className="message-edit-btn message-edit-btn--cancel"
                                                            onClick={() =>
                                                                setEditingMessageId(
                                                                    null,
                                                                )
                                                            }
                                                        >
                                                            Cancel
                                                        </button>
                                                    </div>
                                                </div>
                                            ) : (
                                                <div className="message-content">
                                                    {message.content ?? ""}
                                                </div>
                                            )}
                                            {/* Edit button for user messages */}
                                            {!isGenerating &&
                                                editingMessageId !==
                                                    message.id && (
                                                    <div className="message-actions">
                                                        <button
                                                            type="button"
                                                            className="message-action-btn"
                                                            onClick={() => {
                                                                setEditingMessageId(
                                                                    message.id,
                                                                );
                                                                setEditingContent(
                                                                    message.content ||
                                                                        "",
                                                                );
                                                            }}
                                                            title="Edit message"
                                                        >
                                                            <svg
                                                                viewBox="0 0 24 24"
                                                                fill="none"
                                                                stroke="currentColor"
                                                                strokeWidth="2"
                                                            >
                                                                <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                                                                <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                                                            </svg>
                                                            <span className="action-label">
                                                                Edit
                                                            </span>
                                                        </button>
                                                    </div>
                                                )}
                                        </>
                                    )}

                                    {/* Action buttons for assistant messages */}
                                    {message.role === "assistant" &&
                                        !message.isStreaming &&
                                        !message.isError && (
                                            <div className="message-actions">
                                                <button
                                                    className="message-action-btn"
                                                    onClick={() =>
                                                        copyToClipboard(
                                                            displayContent ||
                                                                message.content ||
                                                                "",
                                                        )
                                                    }
                                                    title="Copy message"
                                                >
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
                                                    <span className="action-label">
                                                        Copy
                                                    </span>
                                                </button>
                                                <button
                                                    className="message-action-btn"
                                                    onClick={() =>
                                                        !isGenerating &&
                                                        onRegenerate()
                                                    }
                                                    title="Regenerate response"
                                                    disabled={isGenerating}
                                                >
                                                    <svg
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        strokeWidth="2"
                                                    >
                                                        <path d="M21 2v6h-6M3 12a9 9 0 0115-6.7L21 8M3 22v-6h6M21 12a9 9 0 01-15 6.7L3 16" />
                                                    </svg>
                                                    <span className="action-label">
                                                        Regenerate
                                                    </span>
                                                </button>
                                            </div>
                                        )}
                                </div>
                            </div>
                        );
                    })}

                    {isGenerating &&
                        (messages.length === 0 ||
                            messages[messages.length - 1]?.role !==
                                "assistant" ||
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
                                    <ThinkingProcess
                                        isThinking={true}
                                        content=""
                                    />
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
            <MediaLightbox
                isOpen={lightboxData.isOpen}
                src={lightboxData.src}
                type={lightboxData.type}
                onClose={() =>
                    setLightboxData({ isOpen: false, src: null, type: "image" })
                }
            />
        </>
    );
};

export default MessageArea;
