// TEMP — accent theme switcher kept during the final visual cleanup.
// Sets `data-accent` on <html> (the whole app re-themes via the recipe in
// tokens.css). Each swatch previews its own accent by scoping itself with
// `data-accent` and reading the recipe's bg-hover — no hardcoded colors.
// To remove: delete this file, its mount in dashboard-shell, and the TEMP block
// in packages/ui/src/styles/tokens.css.
import { cn } from "@pollinations/ui";
import { type FC, useEffect, useState } from "react";

const ACCENTS = [
    "amber",
    "coral",
    "lime",
    "emerald",
    "teal",
    "blue",
    "violet",
    "pink",
    "neutral",
] as const;
type Accent = (typeof ACCENTS)[number];

const STORAGE_KEY = "polli-accent";

function applyAccent(accent: Accent) {
    // amber is the :root default — clear the attribute so it falls back to it.
    if (accent === "amber") {
        document.documentElement.removeAttribute("data-accent");
    } else {
        document.documentElement.setAttribute("data-accent", accent);
    }
}

export const AccentSwitcher: FC = () => {
    const [accent, setAccent] = useState<Accent>("amber");

    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY) as Accent | null;
        if (stored && ACCENTS.includes(stored)) {
            setAccent(stored);
            applyAccent(stored);
        }
    }, []);

    const choose = (next: Accent) => {
        setAccent(next);
        applyAccent(next);
        localStorage.setItem(STORAGE_KEY, next);
    };

    return (
        <div
            className="flex flex-wrap items-center gap-1.5 px-3"
            title="TEMP — accent theme"
        >
            {ACCENTS.map((name) => (
                <button
                    key={name}
                    type="button"
                    data-accent={name}
                    aria-label={`${name} accent`}
                    aria-pressed={accent === name}
                    onClick={() => choose(name)}
                    className={cn(
                        "h-5 w-5 shrink-0 rounded-full border transition-transform hover:scale-110",
                        accent === name &&
                            "ring-2 ring-theme-text-strong ring-offset-1 ring-offset-surface-opaque",
                    )}
                    style={{
                        backgroundColor: "var(--polli-color-bg-hover)",
                        borderColor: "var(--polli-color-border)",
                    }}
                />
            ))}
        </div>
    );
};
