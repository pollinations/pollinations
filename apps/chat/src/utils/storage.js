// Storage utilities
const STORAGE_KEYS = {
    CHATS: "pollinations_chats",
    ACTIVE_CHAT: "pollinations_active_chat",
    THEME: "pollinations_theme",
    MODEL: "pollinations_selected_model",
};

export const getChats = () => {
    try {
        const chats = localStorage.getItem(STORAGE_KEYS.CHATS);
        return chats ? JSON.parse(chats) : [];
    } catch (error) {
        console.error("Error loading chats:", error);
        return [];
    }
};

export const saveChats = (chats) => {
    try {
        localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(chats));
    } catch (error) {
        try {
            if (
                error?.name === "QuotaExceededError" ||
                error?.code === 22 ||
                error?.name === "NS_ERROR_DOM_QUOTA_REACHED"
            ) {
                console.warn(
                    "[storage] quota exceeded — chat history (including image attachments) could not be saved. Images will be lost on page reload.",
                    { approximateBytes: JSON.stringify(chats).length },
                );
                if (typeof window !== "undefined" && window?.showToast) {
                    window.showToast(
                        "Storage full — images can't be saved and will be lost on reload",
                        "warning",
                    );
                }
            }
        } catch {
            // quota detection must never throw
        }
        console.error("Error saving chats:", error);
    }
};

export const getActiveChatId = () => {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_CHAT);
};

export const saveActiveChatId = (chatId) => {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_CHAT, chatId);
};

export const getTheme = () => {
    return localStorage.getItem(STORAGE_KEYS.THEME) || "light";
};

export const saveTheme = (theme) => {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
};

export const getSelectedModel = () => {
    return localStorage.getItem(STORAGE_KEYS.MODEL) || "openai/gpt-5.4-nano";
};

export const saveSelectedModel = (model) => {
    localStorage.setItem(STORAGE_KEYS.MODEL, model);
};

export const generateId = () => {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};
