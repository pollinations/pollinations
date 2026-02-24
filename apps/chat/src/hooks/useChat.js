import { useEffect, useState } from "react";
import {
    generateId,
    getActiveChatId,
    getChats,
    saveActiveChatId,
    saveChats,
} from "../utils/storage";

export const useChat = () => {
    const [chats, setChats] = useState([]);
    const [activeChatId, setActiveChatId] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isUserTyping, setIsUserTyping] = useState(false);

    // Load chats from storage on mount
    useEffect(() => {
        const storedChats = getChats();
        const storedActiveChatId = getActiveChatId();

        if (storedChats.length > 0) {
            setChats(storedChats);
            const hasStoredActiveChat = storedChats.some(
                (chat) => chat.id === storedActiveChatId,
            );
            setActiveChatId(
                hasStoredActiveChat ? storedActiveChatId : storedChats[0].id,
            );
        } else {
            // Create initial chat
            const initialChat = {
                id: generateId(),
                title: "New Chat",
                messages: [],
                createdAt: Date.now(),
            };
            setChats([initialChat]);
            setActiveChatId(initialChat.id);
        }
    }, []);

    // Save chats whenever they change
    useEffect(() => {
        if (chats.length > 0) {
            saveChats(chats);
        }
    }, [chats]);

    // Save active chat ID whenever it changes
    useEffect(() => {
        if (activeChatId) {
            saveActiveChatId(activeChatId);
        }
    }, [activeChatId]);

    const createNewChat = (title = "New Chat") => {
        return {
            id: generateId(),
            title,
            messages: [],
            createdAt: Date.now(),
        };
    };

    const addChat = () => {
        // Don't create a new chat if the current chat is empty
        const activeChat = chats.find((c) => c.id === activeChatId);
        if (activeChat && activeChat.messages.length === 0) {
            // Current chat is already empty, no need to create a new one
            return activeChat;
        }

        const newChat = createNewChat();
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChat.id);
        return newChat;
    };

    const deleteChat = (chatId) => {
        setChats((prev) => {
            const filtered = prev.filter((c) => c.id !== chatId);

            // If we deleted the active chat, switch to another
            if (activeChatId === chatId) {
                if (filtered.length > 0) {
                    setActiveChatId(filtered[0].id);
                } else {
                    // Create a new chat if we deleted the last one
                    const newChat = createNewChat();
                    setActiveChatId(newChat.id);
                    return [newChat];
                }
            }

            return filtered;
        });
    };

    const setActiveChat = (chatId) => {
        setActiveChatId(chatId);
    };

    const getActiveChat = () => {
        return chats.find((c) => c.id === activeChatId);
    };

    const addMessage = (role, content, customId = null, metadata = {}) => {
        let updatedChat = null;
        setChats((prev) => {
            const newChats = prev.map((chat) => {
                if (chat.id === activeChatId) {
                    const newMessage = {
                        id: customId || generateId(),
                        role,
                        content,
                        timestamp: Date.now(),
                        ...metadata,
                    };

                    const updatedMessages = [...chat.messages, newMessage];

                    let updatedTitle = chat.title;
                    if (chat.messages.length === 0 && role === "user") {
                        updatedTitle =
                            content.substring(0, 40) +
                            (content.length > 40 ? "..." : "");
                    }

                    updatedChat = {
                        ...chat,
                        messages: updatedMessages,
                        title: updatedTitle,
                    };
                    return updatedChat;
                }
                return chat;
            });
            return newChats;
        });
        return updatedChat;
    };
    const updateMessage = (messageId, updates) => {
        setChats((prev) =>
            prev.map((chat) => {
                if (chat.id === activeChatId) {
                    return {
                        ...chat,
                        messages: chat.messages.map((msg) =>
                            msg.id === messageId ? { ...msg, ...updates } : msg,
                        ),
                    };
                }
                return chat;
            }),
        );
    };

    const removeLastMessage = () => {
        setChats((prev) =>
            prev.map((chat) => {
                if (chat.id === activeChatId) {
                    return {
                        ...chat,
                        messages: chat.messages.slice(0, -1),
                    };
                }
                return chat;
            }),
        );
    };

    const removeMessagesAfter = (timestamp) => {
        setChats((prev) =>
            prev.map((chat) => {
                if (chat.id === activeChatId) {
                    return {
                        ...chat,
                        messages: chat.messages.filter(
                            (msg) => msg.timestamp <= timestamp,
                        ),
                    };
                }
                return chat;
            }),
        );
    };

    const clearAllChats = () => {
        const newChat = createNewChat();
        setChats([newChat]);
        setActiveChatId(newChat.id);
        saveChats([newChat]);
        saveActiveChatId(newChat.id);
    };

    return {
        chats,
        activeChatId,
        isGenerating,
        setIsGenerating,
        isUserTyping,
        setIsUserTyping,
        addChat,
        deleteChat,
        setActiveChat,
        getActiveChat,
        addMessage,
        updateMessage,
        removeLastMessage,
        removeMessagesAfter,
        clearAllChats,
    };
};
