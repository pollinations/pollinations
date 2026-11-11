import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// `text-micro` is a font size (theme.css), not a colour; see cn.ts.
const twMerge = extendTailwindMerge({
    extend: { theme: { text: ["micro"] } },
});

/** Class merge for apps consuming the unprefixed Tailwind bridge in app.css. */
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}
