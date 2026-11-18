import { cn } from "./cn.ts";

/** Shared square for a native file-picker label or a microphone button. */
export function mediaActionTileClass(disabled: boolean, recording = false) {
    return cn(
        "polli-control polli:relative polli:flex polli:size-20 polli:shrink-0 polli:flex-col polli:items-center polli:justify-center polli:gap-2 polli:rounded-xl polli:border polli:border-dashed polli:border-theme-border polli:bg-theme-bg-pale polli:p-2 polli:text-center polli:font-body polli:text-xs polli:text-theme-text-soft polli:transition-colors polli:[&>svg]:size-6 polli:[&>svg]:shrink-0",
        disabled
            ? "polli:cursor-not-allowed polli:opacity-60"
            : "polli:cursor-pointer polli:hover:bg-theme-fill-wash polli:hover:text-theme-text-strong",
        recording &&
            "polli:border-solid polli:border-intent-danger-text polli:text-intent-danger-text",
    );
}
