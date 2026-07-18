import { clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({ prefix: "polli" });

/** Internal class merge for polli:-prefixed package primitive classes. */
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}
