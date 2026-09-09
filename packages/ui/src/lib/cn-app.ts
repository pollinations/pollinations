import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/** Class merge for apps consuming the unprefixed Tailwind bridge in app.css. */
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}
