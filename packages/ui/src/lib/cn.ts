import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-micro` is a font size (theme.css), not a colour; without this,
// tailwind-merge drops it next to a `text-theme-*` colour class.
const twMerge = extendTailwindMerge({
    prefix: "polli",
    extend: { theme: { text: ["micro"] } },
});

/** Internal class merge for polli:-prefixed package primitive classes. */
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}
