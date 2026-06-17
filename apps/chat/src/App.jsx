import { useCallback, useEffect, useState } from "react";
import BYOPModal from "./components/BYOPModal";
import ChatInput from "./components/ChatInput";
import ConfirmModal from "./components/ConfirmModal";
import GenerationOptionsModal from "./components/GenerationOptionsModal";
import KeyboardShortcutsModal from "./components/KeyboardShortcutsModal";
import MessageArea from "./components/MessageArea";
import SettingsPanel from "./components/SettingsPanel";
import Sidebar from "./components/Sidebar";
import TutorialModal from "./components/TutorialModal";
import { useChat } from "./hooks/useChat";
import {
    generateAudio,
    generateImage,
    generateVideo,
    initializeModels,
    sendMessage,
    stopGeneration,
} from "./utils/api";
import {
    getSelectedModel,
    getTheme,
    saveSelectedModel,
    saveTheme,
} from "./utils/storage";

function App() {
    const {
        chats,
        activeChatId,
        isGenerating,
        setIsGenerating,
        addChat,
        deleteChat,
        setActiveChat,
        getActiveChat,
        addMessage,
        updateMessage,
        removeMessagesAfter,
        clearAllChats,
    } = useChat();

    const [_sidebarOpen, setSidebarOpen] = useState(false);
    const [selectedModel, setSelectedModel] = useState("openai");
    const [selectedImageModel, setSelectedImageModel] = useState("flux");
    const [selectedVideoModel, setSelectedVideoModel] = useState("veo");
    const [selectedAudioModel, setSelectedAudioModel] =
        useState("openai-audio");
    const [theme, setTheme] = useState("dark");
    const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
    const [isBYOPModalOpen, setIsBYOPModalOpen] = useState(false);

    const [models, setModels] = useState({});
    const [imageModels, setImageModels] = useState({});
    const [videoModels, setVideoModels] = useState({});
    const [audioModels, setAudioModels] = useState({});
    const [modelsLoaded, setModelsLoaded] = useState(false);

    const [confirmModal, setConfirmModal] = useState({
        isOpen: false,
        title: "",
        message: "",
        onConfirm: null,
        isDangerous: false,
    });
    const [mode, setMode] = useState("chat");
    const [sessionSettings, setSessionSettings] = useState({
        systemPrompt:
            "You are a helpful AI assistant who speaks concisely and helpfully.",
        maxTokens: 2000,
        temperature: 0.7,
        topP: 1,
    });
    const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
    const [isTutorialOpen, setIsTutorialOpen] = useState(false);
    const [isGenerationOptionsOpen, setIsGenerationOptionsOpen] =
        useState(false);
    const [generationOptionsMode, setGenerationOptionsMode] =
        useState("imagine");
    const [imageGenerationOptions, setImageGenerationOptions] = useState({
        width: 1024,
        height: 1024,
        seed: 42,
        enhance: false,
        nologo: false,
        nofeed: false,
        safe: false,
        quality: "medium",
    });
    const [videoGenerationOptions, setVideoGenerationOptions] = useState({
        seed: 42,
        nologo: false,
        nofeed: false,
        duration: 4,
        aspectRatio: "16:9",
        audio: false,
    });

    // Tutorial on first visit
    useEffect(() => {
        if (!localStorage.getItem("hasSeenTutorial")) setIsTutorialOpen(true);
    }, []);

    // Expose a global BYOP opener so MessageBubble (and any error UI)
    // can trigger the modal without prop-drilling.
    useEffect(() => {
        window.openBYOPModal = () => setIsBYOPModalOpen(true);
        return () => {
            delete window.openBYOPModal;
        };
    }, []);

    const handleCloseTutorial = useCallback(() => {
        setIsTutorialOpen(false);
        localStorage.setItem("hasSeenTutorial", "true");
    }, []);

    // Load models
    useEffect(() => {
        initializeModels().then(
            ({ textModels, imageModels, videoModels, audioModels }) => {
                setModels(textModels);
                setImageModels(imageModels);
                setVideoModels(videoModels);
                setAudioModels(audioModels);
                setModelsLoaded(true);
            },
        );
    }, []);

    // Load persisted preferences
    useEffect(() => {
        const savedModel = getSelectedModel();
        const savedImageModel =
            localStorage.getItem("selectedImageModel") || "flux";
        const savedVideoModel =
            localStorage.getItem("selectedVideoModel") || "veo";
        const savedAudioModel =
            localStorage.getItem("selectedAudioModel") || "openai-audio";
        const savedTheme = getTheme();
        setSelectedModel(savedModel);
        setSelectedImageModel(savedImageModel);
        setSelectedVideoModel(savedVideoModel);
        setSelectedAudioModel(savedAudioModel);
        setTheme(savedTheme);
        applyTheme(savedTheme);
    }, []);

    const applyTheme = (t) => {
        document.body.classList.toggle("dark", t === "dark");
        document.body.classList.toggle("light", t !== "dark");
    };

    // Keyboard shortcuts
    useEffect(() => {
        const onKey = (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "k") {
                e.preventDefault();
                document.getElementById("messageInput")?.focus();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "n") {
                e.preventDefault();
                addChat();
            }
            if ((e.ctrlKey || e.metaKey) && e.key === "b") {
                e.preventDefault();
                setSidebarOpen((p) => !p);
            }
            if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === "L") {
                e.preventDefault();
                handleThemeToggle();
            }
            if (e.key === "Escape") setIsShortcutsModalOpen(false);
        };
        document.addEventListener("keydown", onKey);
        return () => document.removeEventListener("keydown", onKey);
    }, [addChat]);

    const handleModelChange = useCallback((m) => {
        setSelectedModel(m);
        saveSelectedModel(m);
    }, []);
    const handleImageModelChange = useCallback((m) => {
        setSelectedImageModel(m);
        localStorage.setItem("selectedImageModel", m);
    }, []);
    const handleVideoModelChange = useCallback((m) => {
        setSelectedVideoModel(m);
        localStorage.setItem("selectedVideoModel", m);
    }, []);
    const handleAudioModelChange = useCallback((m) => {
        setSelectedAudioModel(m);
        localStorage.setItem("selectedAudioModel", m);
    }, []);

    const handleThemeToggle = useCallback(() => {
        const next = theme === "dark" ? "light" : "dark";
        setTheme(next);
        saveTheme(next);
        applyTheme(next);
    }, [theme]);

    const handleExportChat = () => {
        const chat = getActiveChat();
        if (!chat?.messages.length) {
            if (window?.showToast)
                window.showToast("No messages to export", "error");
            return;
        }
        const blob = new Blob(
            [
                JSON.stringify(
                    {
                        title: chat.title,
                        timestamp: new Date().toISOString(),
                        messages: chat.messages.map((m) => ({
                            role: m.role,
                            content: m.content,
                            timestamp: m.timestamp,
                        })),
                    },
                    null,
                    2,
                ),
            ],
            { type: "application/json" },
        );
        const a = Object.assign(document.createElement("a"), {
            href: URL.createObjectURL(blob),
            download: `chat-${Date.now()}.json`,
        });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const handleClearAll = () =>
        setConfirmModal({
            isOpen: true,
            title: "Clear All Chats",
            message: "Delete all chats? This cannot be undone.",
            onConfirm: clearAllChats,
            isDangerous: true,
        });

    const handleSessionSettingsChange = useCallback(
        (field, value) => setSessionSettings((p) => ({ ...p, [field]: value })),
        [],
    );

    const handleOpenGenerationOptions = useCallback((m) => {
        setGenerationOptionsMode(m);
        setIsGenerationOptionsOpen(true);
    }, []);

    const handleGenerationOptionsApply = useCallback(
        (options) => {
            if (generationOptionsMode === "imagine")
                setImageGenerationOptions(options);
            else if (generationOptionsMode === "video")
                setVideoGenerationOptions(options);
        },
        [generationOptionsMode],
    );

    // ── Send text message ────────────────────────────────────────
    const handleSendMessage = useCallback(
        async ({ text = "", attachment = null } = {}) => {
            const trimmed = typeof text === "string" ? text.trim() : "";
            if ((!trimmed && !attachment) || isGenerating) return;

            const attachments = attachment
                ? [
                      {
                          name: attachment.name,
                          mimeType:
                              attachment.mimeType || "application/octet-stream",
                          data: attachment.base64 || attachment.data || "",
                          size: attachment.size,
                          preview: attachment.preview || null,
                          isImage:
                              attachment.isImage ??
                              (attachment.mimeType?.startsWith("image/") ||
                                  false),
                      },
                  ]
                : [];

            if (
                attachments[0] &&
                !attachments[0].data &&
                attachment?.preview?.startsWith("data:")
            ) {
                const ci = attachment.preview.indexOf(",");
                attachments[0].data =
                    ci >= 0
                        ? attachment.preview.slice(ci + 1)
                        : attachment.preview;
            }

            const messageContent =
                trimmed ||
                (attachments[0]?.name
                    ? `Shared file: ${attachments[0].name}`
                    : "Shared a file");
            const updatedChat = addMessage(
                "user",
                messageContent,
                null,
                attachments.length
                    ? {
                          attachments,
                          ...(attachments[0]?.isImage && attachments[0]?.preview
                              ? {
                                    image: {
                                        src: attachments[0].preview,
                                        name: attachments[0].name,
                                    },
                                }
                              : {}),
                      }
                    : {},
            );

            setIsGenerating(true);
            if (!updatedChat) {
                setIsGenerating(false);
                if (window?.showToast)
                    window.showToast("Could not find active chat", "error");
                return;
            }

            const assistantId =
                Date.now().toString(36) + Math.random().toString(36).slice(2);
            addMessage("assistant", "", assistantId, { isStreaming: true });

            const runtimeMessages = sessionSettings.systemPrompt?.trim()
                ? [
                      {
                          role: "system",
                          content: sessionSettings.systemPrompt.trim(),
                      },
                      ...updatedChat.messages,
                  ]
                : updatedChat.messages;

            const applyError = (error) => {
                if (error.message === "User aborted") {
                    updateMessage(assistantId, {
                        content: "**Message stopped by user**",
                        isStreaming: false,
                        isError: false,
                    });
                } else {
                    updateMessage(assistantId, {
                        content: error.message,
                        isStreaming: false,
                        isError: true,
                        errorType: error.errorType || "unknown",
                        errorCode: error.code || null,
                    });
                }
                setIsGenerating(false);
            };

            try {
                await sendMessage(
                    runtimeMessages,
                    (_, fullContent) =>
                        updateMessage(assistantId, {
                            content: fullContent,
                            isStreaming: true,
                        }),
                    (fullContent) => {
                        updateMessage(assistantId, {
                            content: fullContent,
                            isStreaming: false,
                        });
                        setIsGenerating(false);
                    },
                    applyError,
                    selectedModel,
                    {
                        maxTokens: sessionSettings.maxTokens,
                        temperature: sessionSettings.temperature,
                        topP: sessionSettings.topP,
                    },
                );
            } catch (error) {
                applyError(error);
            }
        },
        [
            isGenerating,
            addMessage,
            updateMessage,
            selectedModel,
            sessionSettings,
        ],
    );

    const handleStopGeneration = useCallback(() => {
        stopGeneration();
        setIsGenerating(false);
    }, []);

    // ── Image generation ─────────────────────────────────────────
    const handleGenerateImage = useCallback(
        async (prompt) => {
            if (!prompt.trim() || isGenerating) return;
            const updatedChat = addMessage("user", `/imagine ${prompt}`);
            setIsGenerating(true);
            if (!updatedChat) {
                setIsGenerating(false);
                return;
            }
            const aid =
                Date.now().toString(36) + Math.random().toString(36).slice(2);
            addMessage("assistant", "Generating image…", aid);
            try {
                const img = await generateImage(prompt, {
                    model: selectedImageModel,
                    ...imageGenerationOptions,
                });
                updateMessage(aid, {
                    content: "",
                    imageUrl: img.url,
                    imagePrompt: img.prompt,
                    imageModel: img.model,
                    isStreaming: false,
                });
            } catch (error) {
                updateMessage(aid, {
                    content: error.message,
                    isStreaming: false,
                    isError: true,
                    errorType: error.errorType || "unknown",
                    errorCode: error.code || null,
                });
                if (window?.showToast)
                    window.showToast("Image generation failed", "error");
            }
            setIsGenerating(false);
        },
        [
            isGenerating,
            selectedImageModel,
            imageGenerationOptions,
            addMessage,
            updateMessage,
        ],
    );

    // ── Video generation ─────────────────────────────────────────
    const handleGenerateVideo = useCallback(
        async (prompt) => {
            if (!prompt.trim() || isGenerating) return;
            const updatedChat = addMessage("user", `/video ${prompt}`);
            setIsGenerating(true);
            if (!updatedChat) {
                setIsGenerating(false);
                return;
            }
            const aid =
                Date.now().toString(36) + Math.random().toString(36).slice(2);
            addMessage(
                "assistant",
                "Generating video… This may take a minute.",
                aid,
            );
            try {
                const vid = await generateVideo(prompt, {
                    model: selectedVideoModel,
                    ...videoGenerationOptions,
                });
                updateMessage(aid, {
                    content: "",
                    videoUrl: vid.url,
                    videoPrompt: vid.prompt,
                    videoModel: vid.model,
                    isStreaming: false,
                });
            } catch (error) {
                updateMessage(aid, {
                    content: error.message,
                    isStreaming: false,
                    isError: true,
                    errorType: error.errorType || "unknown",
                    errorCode: error.code || null,
                });
                if (window?.showToast)
                    window.showToast("Video generation failed", "error");
            }
            setIsGenerating(false);
        },
        [
            isGenerating,
            selectedVideoModel,
            videoGenerationOptions,
            addMessage,
            updateMessage,
        ],
    );

    // ── Audio generation ─────────────────────────────────────────
    const handleGenerateAudio = useCallback(
        async (text, options = {}) => {
            if (!text.trim() || isGenerating) return;
            const updatedChat = addMessage("user", `/audio ${text}`);
            setIsGenerating(true);
            if (!updatedChat) {
                setIsGenerating(false);
                return;
            }
            const aid =
                Date.now().toString(36) + Math.random().toString(36).slice(2);
            addMessage("assistant", "Generating audio…", aid);
            try {
                const aud = await generateAudio(text, {
                    model: selectedAudioModel,
                    ...options,
                });
                updateMessage(aid, {
                    content: "",
                    audioUrl: aud.url,
                    audioText: aud.text,
                    audioVoice: aud.voice,
                    audioModel: aud.model,
                    isStreaming: false,
                });
            } catch (error) {
                updateMessage(aid, {
                    content: error.message,
                    isStreaming: false,
                    isError: true,
                    errorType: error.errorType || "unknown",
                    errorCode: error.code || null,
                });
                if (window?.showToast)
                    window.showToast("Audio generation failed", "error");
            }
            setIsGenerating(false);
        },
        [isGenerating, selectedAudioModel, addMessage, updateMessage],
    );

    // ── Regenerate ──────────────────────────────────────────────
    const handleRegenerateMessage = useCallback(async () => {
        const chat = getActiveChat();
        if (!chat || isGenerating) return;
        const lastUser = [...chat.messages]
            .reverse()
            .find((m) => m.role === "user");
        if (!lastUser) return;
        removeMessagesAfter(lastUser.timestamp);
        setTimeout(() => {
            const updated = getActiveChat();
            const aid =
                Date.now().toString(36) + Math.random().toString(36).slice(2);
            addMessage("assistant", "", aid, { isStreaming: true });
            setIsGenerating(true);
            const runtimeMessages = sessionSettings.systemPrompt?.trim()
                ? [
                      {
                          role: "system",
                          content: sessionSettings.systemPrompt.trim(),
                      },
                      ...updated.messages,
                  ]
                : updated.messages;
            sendMessage(
                runtimeMessages,
                (_, full) =>
                    updateMessage(aid, { content: full, isStreaming: true }),
                (full) => {
                    updateMessage(aid, { content: full, isStreaming: false });
                    setIsGenerating(false);
                },
                (error) => {
                    if (error.message === "User aborted") {
                        updateMessage(aid, {
                            content: "**Message stopped by user**",
                            isStreaming: false,
                            isError: false,
                        });
                    } else {
                        updateMessage(aid, {
                            content: error.message,
                            isStreaming: false,
                            isError: true,
                            errorType: error.errorType || "unknown",
                            errorCode: error.code || null,
                        });
                    }
                    setIsGenerating(false);
                },
                selectedModel,
                {
                    maxTokens: sessionSettings.maxTokens,
                    temperature: sessionSettings.temperature,
                    topP: sessionSettings.topP,
                },
            );
        }, 100);
    }, [
        getActiveChat,
        isGenerating,
        removeMessagesAfter,
        addMessage,
        updateMessage,
        selectedModel,
        sessionSettings,
    ]);

    const activeMessages = getActiveChat()?.messages || [];

    return (
        <div className="app">
            <Sidebar
                chats={chats}
                activeChatId={activeChatId}
                onChatSelect={setActiveChat}
                onNewChat={addChat}
                onDeleteChat={deleteChat}
                onThemeToggle={handleThemeToggle}
                theme={theme}
                onOpenSettings={() => setIsSettingsPanelOpen(true)}
                onExportChat={handleExportChat}
                onClearAll={handleClearAll}
            />

            <div
                className={`chat-container ${activeMessages.length === 0 ? "chat-container-empty" : ""}`}
            >
                <MessageArea
                    messages={activeMessages}
                    isGenerating={isGenerating}
                    onRegenerate={handleRegenerateMessage}
                />

                <ChatInput
                    onSend={handleSendMessage}
                    isGenerating={isGenerating}
                    onStop={handleStopGeneration}
                    onGenerateImage={handleGenerateImage}
                    onGenerateVideo={handleGenerateVideo}
                    onGenerateAudio={handleGenerateAudio}
                    setIsUserTyping={() => {}}
                    onModeChange={setMode}
                    selectedModel={selectedModel}
                    selectedImageModel={selectedImageModel}
                    selectedVideoModel={selectedVideoModel}
                    selectedAudioModel={selectedAudioModel}
                    mode={mode}
                    models={models}
                    imageModels={imageModels}
                    videoModels={videoModels}
                    audioModels={audioModels}
                    modelsLoaded={modelsLoaded}
                    onModelChange={handleModelChange}
                    onImageModelChange={handleImageModelChange}
                    onVideoModelChange={handleVideoModelChange}
                    onAudioModelChange={handleAudioModelChange}
                    onOpenGenerationOptions={handleOpenGenerationOptions}
                />
            </div>

            <KeyboardShortcutsModal
                isOpen={isShortcutsModalOpen}
                onClose={() => setIsShortcutsModalOpen(false)}
            />

            <BYOPModal
                isOpen={isBYOPModalOpen}
                onClose={() => setIsBYOPModalOpen(false)}
            />

            <SettingsPanel
                isOpen={isSettingsPanelOpen}
                settings={sessionSettings}
                onChange={handleSessionSettingsChange}
                onClose={() => setIsSettingsPanelOpen(false)}
            />

            <ConfirmModal
                isOpen={confirmModal.isOpen}
                onClose={() =>
                    setConfirmModal((p) => ({ ...p, isOpen: false }))
                }
                onConfirm={confirmModal.onConfirm}
                title={confirmModal.title}
                message={confirmModal.message}
                confirmText="Delete"
                cancelText="Cancel"
                isDangerous={confirmModal.isDangerous}
            />

            <TutorialModal
                isOpen={isTutorialOpen}
                onClose={handleCloseTutorial}
            />

            <GenerationOptionsModal
                isOpen={isGenerationOptionsOpen}
                onClose={() => setIsGenerationOptionsOpen(false)}
                mode={generationOptionsMode}
                onGenerate={handleGenerationOptionsApply}
            />
        </div>
    );
}

export default App;
