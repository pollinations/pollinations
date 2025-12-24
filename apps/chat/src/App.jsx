import { useState, useEffect, useCallback, useMemo } from 'react';
import { useChat } from './hooks/useChat';
import { sendMessage, stopGeneration, initializeModels, generateImage, generateVideo } from './utils/api';
import { getSelectedModel, saveSelectedModel, getTheme, saveTheme } from './utils/storage';
import Sidebar from './components/Sidebar';
import ChatHeader from './components/ChatHeader';
import MessageArea from './components/MessageArea';
import ChatInput from './components/ChatInput';
import KeyboardShortcutsModal from './components/KeyboardShortcutsModal';
import ConfirmModal from './components/ConfirmModal';
import SettingsPanel from './components/SettingsPanel';
import TutorialModal from './components/TutorialModal';
import GenerationOptionsModal from './components/GenerationOptionsModal';

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
    clearAllChats
  } = useChat();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState('openai');
  const [selectedImageModel, setSelectedImageModel] = useState('flux');
  const [selectedVideoModel, setSelectedVideoModel] = useState('veo');
  const [theme, setTheme] = useState('light');
  const [isShortcutsModalOpen, setIsShortcutsModalOpen] = useState(false);
  const [models, setModels] = useState({});
  const [imageModels, setImageModels] = useState({});
  const [videoModels, setVideoModels] = useState({});
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: null,
    isDangerous: false
  });
  const [mode, setMode] = useState('chat');
  const [sessionSettings, setSessionSettings] = useState({
    systemPrompt: 'You are a helpful AI assistant who speaks concisely and helpfully.',
    maxTokens: 2000,
    temperature: 0.7,
    topP: 1
  });
  const [isSettingsPanelOpen, setIsSettingsPanelOpen] = useState(false);
  const [isTutorialOpen, setIsTutorialOpen] = useState(false);
  const [isGenerationOptionsOpen, setIsGenerationOptionsOpen] = useState(false);
  const [generationOptionsMode, setGenerationOptionsMode] = useState('imagine');
  const [imageGenerationOptions, setImageGenerationOptions] = useState({
    width: 1024,
    height: 1024,
    seed: 42,
    enhance: false,
    nologo: false,
    nofeed: false,
    safe: false,
    quality: 'medium'
  });
  const [videoGenerationOptions, setVideoGenerationOptions] = useState({
    seed: 42,
    nologo: false,
    nofeed: false,
    duration: 4,
    aspectRatio: '16:9',
    audio: false
  });

  // Show tutorial on first visit
  useEffect(() => {
    const hasSeenTutorial = localStorage.getItem('hasSeenTutorial');
    if (!hasSeenTutorial) {
      setIsTutorialOpen(true);
    }
  }, []);

  const handleCloseTutorial = useCallback(() => {
    setIsTutorialOpen(false);
    localStorage.setItem('hasSeenTutorial', 'true');
  }, []);

  // Debug mode changes
  useEffect(() => {
  }, [mode]);

  // Initialize models on mount
  useEffect(() => {
    const init = async () => {
      const { textModels, imageModels, videoModels } = await initializeModels();
      setModels(textModels);
      setImageModels(imageModels);
      setVideoModels(videoModels);
      setModelsLoaded(true);
    };
    init();
  }, []);

  useEffect(() => {
    const savedModel = getSelectedModel();
    const savedImageModel = localStorage.getItem('selectedImageModel') || 'flux';
    const savedVideoModel = localStorage.getItem('selectedVideoModel') || 'veo';
    const savedTheme = getTheme();
    setSelectedModel(savedModel);
    setSelectedImageModel(savedImageModel);
    setSelectedVideoModel(savedVideoModel);
    setTheme(savedTheme);
    
    // Apply theme to document
    if (savedTheme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+K: Focus input
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('messageInput')?.focus();
      }
      // Ctrl+N: New chat
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        addChat();
      }
      // Ctrl+B: Toggle sidebar
      if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        setSidebarOpen(prev => !prev);
      }
      // Ctrl+Shift+L: Toggle theme
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'L') {
        e.preventDefault();
        handleThemeToggle();
      }
      // Esc: Close modals
      if (e.key === 'Escape') {
        setIsShortcutsModalOpen(false);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addChat]);

  const handleModelChange = useCallback((model) => {
    setSelectedModel(model);
    saveSelectedModel(model);
  }, []);

  const handleImageModelChange = useCallback((model) => {
    setSelectedImageModel(model);
    localStorage.setItem('selectedImageModel', model);
  }, []);

  const handleVideoModelChange = useCallback((model) => {
    setSelectedVideoModel(model);
    localStorage.setItem('selectedVideoModel', model);
  }, []);

  const handleThemeToggle = useCallback(() => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    saveTheme(newTheme);
    
    if (newTheme === 'dark') {
      document.body.classList.add('dark');
      document.body.classList.remove('light');
    } else {
      document.body.classList.remove('dark');
      document.body.classList.add('light');
    }
  }, [theme]);

  const handleExportChat = () => {
    const activeChat = getActiveChat();
    if (!activeChat || !activeChat.messages.length) {
      alert('No messages to export');
      return;
    }

    // Create export data
    const exportData = {
      title: activeChat.title,
      timestamp: new Date().toISOString(),
      messages: activeChat.messages.map(msg => ({
        role: msg.role,
        content: msg.content,
        timestamp: msg.timestamp
      }))
    };

    // Download as JSON
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-export-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClearAll = () => {
    setConfirmModal({
      isOpen: true,
      title: 'Clear All Chats',
      message: 'Are you sure you want to delete all chats? This action cannot be undone.',
      onConfirm: () => clearAllChats(),
      isDangerous: true
    });
  };

  const handleSessionSettingsChange = useCallback((field, value) => {
    setSessionSettings(prev => ({
      ...prev,
      [field]: value
    }));
  }, []);

  const handleOpenGenerationOptions = useCallback((mode) => {
    setGenerationOptionsMode(mode);
    setIsGenerationOptionsOpen(true);
  }, []);

  const handleGenerationOptionsApply = useCallback((options) => {
    if (generationOptionsMode === 'imagine') {
      setImageGenerationOptions(options);
    } else if (generationOptionsMode === 'video') {
      setVideoGenerationOptions(options);
    }
  }, [generationOptionsMode]);

  const handleSendMessage = useCallback(async ({ text = '', attachment = null } = {}) => {
    const trimmedContent = typeof text === 'string' ? text.trim() : '';

    if ((!trimmedContent && !attachment) || isGenerating) return;

    const attachments = attachment ? [{
      name: attachment.name,
      mimeType: attachment.mimeType || attachment.file?.type || 'application/octet-stream',
      data: attachment.base64 || attachment.data || '',
      size: attachment.size,
      preview: attachment.preview || null,
      isImage: attachment.isImage ?? (attachment.mimeType ? attachment.mimeType.startsWith('image/') : false)
    }] : [];

    if (attachments[0] && !attachments[0].data && attachment?.preview?.startsWith('data:')) {
      const commaIndex = attachment.preview.indexOf(',');
      attachments[0].data = commaIndex >= 0 ? attachment.preview.slice(commaIndex + 1) : attachment.preview;
    }

    const messageMetadata = attachments.length ? {
      attachments,
      ...(attachments[0]?.isImage && attachments[0]?.preview ? {
        image: {
          src: attachments[0].preview,
          name: attachments[0].name
        }
      } : {})
    } : {};

    const isImageAttachment = attachments[0]?.isImage;
    const attachmentLabel = isImageAttachment ? 'image' : 'file';
    const attachmentArticle = isImageAttachment ? 'an' : 'a';
    const messageContent = trimmedContent || (attachments.length
      ? attachments[0]?.name
        ? `Shared ${attachmentArticle} ${attachmentLabel}: ${attachments[0].name}`
        : `Shared ${attachmentArticle} ${attachmentLabel}`
      : '');

    // Add user message and get the updated chat
    const updatedChat = addMessage('user', messageContent, null, messageMetadata);

    // Set generating state
    setIsGenerating(true);

    if (!updatedChat) {
      console.error("Could not find active chat to send message.");
      setIsGenerating(false);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Could not find active chat to send message.", "error");
      return;
    }

    // Create assistant message placeholder
    const assistantMessageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    addMessage('assistant', '', assistantMessageId, { isStreaming: true });
    
    const runtimeMessages = sessionSettings.systemPrompt?.trim()
      ? [{ role: 'system', content: sessionSettings.systemPrompt.trim() }, ...updatedChat.messages]
      : updatedChat.messages;

    try {
      await sendMessage(
        runtimeMessages,
        // onChunk
        (chunk, fullContent, fullReasoning) => {
          // Update the message content in real-time for streaming
          updateMessage(assistantMessageId, {
            content: fullContent,
            reasoning: fullReasoning,
            isStreaming: true
          });
        },
        // onComplete
        (fullContent, fullReasoning) => {
          updateMessage(assistantMessageId, {
            content: fullContent,
            reasoning: fullReasoning,
            isStreaming: false
          });
          setIsGenerating(false);
        },
        // onError
        (error) => {
          console.error('Message generation error:', error);
          if (error.message === 'User aborted') {
            updateMessage(assistantMessageId, {
              content: '**Message stopped by user**',
              isStreaming: false,
              isError: false
            });
          } else {
            updateMessage(assistantMessageId, {
              content: 'An error occurred',
              isStreaming: false,
              isError: true
            });
          }
          setIsGenerating(false);
        },
        // modelId - pass the selected model
        selectedModel,
        {
          maxTokens: sessionSettings.maxTokens,
          temperature: sessionSettings.temperature,
          topP: sessionSettings.topP
        }
      );
    } catch (error) {
      console.error('Message generation error:', error);
      if (error.message === 'User aborted') {
        updateMessage(assistantMessageId, {
          content: '**Message stopped by user**',
          isStreaming: false,
          isError: false
        });
      } else {
        updateMessage(assistantMessageId, {
          content: 'An error occurred',
          isStreaming: false,
          isError: true
        });
      }
      setIsGenerating(false);
    }
  }, [isGenerating, addMessage, updateMessage, selectedModel, sessionSettings]);

  const handleStopGeneration = useCallback(() => {
    stopGeneration();
    setIsGenerating(false);
  }, []);

  const handleGenerateImage = useCallback(async (prompt) => {
    if (!prompt.trim() || isGenerating) return;

    // Add user message with the prompt
    const updatedChat = addMessage('user', `/imagine ${prompt}`);
    
    // Set generating state
    setIsGenerating(true);

    if (!updatedChat) {
      console.error("Could not find active chat to generate image.");
      setIsGenerating(false);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Could not find active chat to generate image.", "error");
      return;
    }

    // Create assistant message placeholder for the image
    const assistantMessageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    addMessage('assistant', 'Generating image...', assistantMessageId);

    try {
      
      // Generate the image with selected model and options
      const imageData = await generateImage(prompt, {
        model: selectedImageModel,
        ...imageGenerationOptions
      });

      // Update the message with the generated image
      updateMessage(assistantMessageId, {
        content: '',
        imageUrl: imageData.url,
        imagePrompt: imageData.prompt,
        imageModel: imageData.model,
        isStreaming: false
      });

      setIsGenerating(false);
    } catch (error) {
      console.error('Image generation error:', error);
      updateMessage(assistantMessageId, {
        content: 'An error occurred',
        isStreaming: false,
        isError: true
      });
      setIsGenerating(false);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Image generation failed", "error");
    }
  }, [isGenerating, selectedImageModel, imageGenerationOptions, addMessage, updateMessage]);

  const handleGenerateVideo = useCallback(async (prompt) => {
    if (!prompt.trim() || isGenerating) return;

    // Add user message with the prompt
    const updatedChat = addMessage('user', `/video ${prompt}`);
    
    // Set generating state
    setIsGenerating(true);

    if (!updatedChat) {
      console.error("Could not find active chat to generate video.");
      setIsGenerating(false);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Could not find active chat to generate video.", "error");
      return;
    }

    // Create assistant message placeholder for the video
    const assistantMessageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    addMessage('assistant', 'Generating video... This may take a minute.', assistantMessageId);

    try {
      // Generate the video with selected model and options
      const videoData = await generateVideo(prompt, {
        model: selectedVideoModel,
        ...videoGenerationOptions
      });

      // Update the message with the generated video
      updateMessage(assistantMessageId, {
        content: '',
        videoUrl: videoData.url,
        videoPrompt: videoData.prompt,
        videoModel: videoData.model,
        isStreaming: false
      });

      setIsGenerating(false);
    } catch (error) {
      console.error('Video generation error:', error);
      updateMessage(assistantMessageId, {
        content: 'An error occurred while generating video',
        isStreaming: false,
        isError: true
      });
      setIsGenerating(false);
      // Show toast notification for error
      if (window?.showToast) window.showToast("Video generation failed", "error");
    }
  }, [isGenerating, selectedVideoModel, videoGenerationOptions, addMessage, updateMessage]);

  const handleRegenerateMessage = async () => {
    const activeChat = getActiveChat();
    if (!activeChat || isGenerating) return;

    const messages = activeChat.messages;
    if (messages.length < 2) return;

    // Find the last user message
    let lastUserMessage = null;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        lastUserMessage = messages[i];
        break;
      }
    }

    if (!lastUserMessage) return;

    // Remove all messages after the last user message
    removeMessagesAfter(lastUserMessage.timestamp);

    // Wait a bit for state to update
    setTimeout(() => {
      // Regenerate the response by re-processing the messages
      const updatedChat = getActiveChat();
      // Create assistant message
      const assistantMessageId = Date.now().toString(36) + Math.random().toString(36).substr(2);
      addMessage('assistant', '', assistantMessageId, { isStreaming: true });
      
      setIsGenerating(true);
      
      const runtimeMessages = sessionSettings.systemPrompt?.trim()
        ? [{ role: 'system', content: sessionSettings.systemPrompt.trim() }, ...updatedChat.messages]
        : updatedChat.messages;

      sendMessage(
        runtimeMessages,
        (chunk, fullContent) => {
          updateMessage(assistantMessageId, {
            content: fullContent,
            isStreaming: true
          });
        },
        (fullContent) => {
          updateMessage(assistantMessageId, {
            content: fullContent,
            isStreaming: false
          });
          setIsGenerating(false);
        },
        (error) => {
          console.error('Message regeneration error:', error);
          if (error.message === 'User aborted') {
            updateMessage(assistantMessageId, {
              content: '**Message stopped by user**',
              isStreaming: false,
              isError: false
            });
          } else {
            updateMessage(assistantMessageId, {
              content: 'An error occurred',
              isStreaming: false,
              isError: true
            });
          }
          setIsGenerating(false);
        },
        selectedModel,
        {
          maxTokens: sessionSettings.maxTokens,
          temperature: sessionSettings.temperature,
          topP: sessionSettings.topP
        }
      );
    }, 100);
  };

  const activeChat = getActiveChat();
  const activeMessages = activeChat?.messages || [];
  const isChatEmpty = activeMessages.length === 0;

  return (
    <div className="app">
      <Sidebar
        chats={chats}
        activeChatId={activeChatId}
        onChatSelect={setActiveChat}
        onNewChat={addChat}
        onDeleteChat={deleteChat}
        onThemeToggle={handleThemeToggle}
        onOpenSettings={() => setIsSettingsPanelOpen(true)}
      />
      
      <div className={`chat-container ${isChatEmpty ? 'chat-container-empty' : ''}`}>
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
          setIsUserTyping={() => {}}
          onModeChange={setMode}
          selectedModel={selectedModel}
          selectedImageModel={selectedImageModel}
          selectedVideoModel={selectedVideoModel}
          mode={mode}
          models={models}
          imageModels={imageModels}
          videoModels={videoModels}
          modelsLoaded={modelsLoaded}
          onModelChange={handleModelChange}
          onImageModelChange={handleImageModelChange}
          onVideoModelChange={handleVideoModelChange}
          onOpenGenerationOptions={handleOpenGenerationOptions}
        />
      </div>

      <KeyboardShortcutsModal
        isOpen={isShortcutsModalOpen}
        onClose={() => setIsShortcutsModalOpen(false)}
      />

      <SettingsPanel
        isOpen={isSettingsPanelOpen}
        settings={sessionSettings}
        onChange={handleSessionSettingsChange}
        onClose={() => setIsSettingsPanelOpen(false)}
      />

      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal({ ...confirmModal, isOpen: false })}
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
