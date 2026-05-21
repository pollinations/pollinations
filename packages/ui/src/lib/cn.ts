import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

// Helper function to merge Tailwind classes safely
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}
