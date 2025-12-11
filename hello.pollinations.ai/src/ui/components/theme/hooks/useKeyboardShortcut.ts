import { useEffect } from "react";

export function useKeyboardShortcut(
    key: string,
    ctrl: boolean,
    callback: () => void,
) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (ctrl && e.ctrlKey && e.key === key) {
                e.preventDefault();
                callback();
            } else if (!ctrl && e.key === key) {
                e.preventDefault();
                callback();
            }
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [key, ctrl, callback]);
}
