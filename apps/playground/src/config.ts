type PlaygroundImportMeta = ImportMeta & {
    env?: {
        VITE_POLLI_APP_KEY?: string;
        VITE_ENTER_URL?: string;
    };
};

const env = (import.meta as PlaygroundImportMeta).env;

export const POLLI_APP_KEY =
    env?.VITE_POLLI_APP_KEY || "pk_YKOUHB80IUJYfwCB";
export const ENTER_URL = (
    env?.VITE_ENTER_URL || "https://enter.pollinations.ai"
).replace(/\/$/, "");
