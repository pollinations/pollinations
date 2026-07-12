/// <reference types="vite/client" />

interface ImportMetaEnv {
    /** Base URL for the gen worker catalog API (e.g. http://localhost:8788 in dev). */
    readonly VITE_GEN_BASE_URL?: string;
}
