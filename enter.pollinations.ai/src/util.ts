import { clsx } from "clsx/lite";
import { customAlphabet } from "nanoid";
import { twMerge } from "tailwind-merge";

const generateUniqueId = customAlphabet(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
);

export const generateRandomId = () => generateUniqueId(32);

// Helper function to merge Tailwind classes safely
export function cn(...inputs: (string | undefined | null | false)[]) {
    return twMerge(clsx(...inputs));
}

export function* batches<T>(
    array: T[],
    size: number,
): Generator<T[], void, void> {
    for (let i = 0; i < array.length; i += size) {
        yield array.slice(i, i + size);
    }
}
