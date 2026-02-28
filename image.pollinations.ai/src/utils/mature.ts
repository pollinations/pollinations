import { words } from "../config/matureWords.ts";

export function isMature(raw_input: string): boolean {
    const input = raw_input.toLowerCase();
    return words.some((word) => input.includes(word.toLowerCase()));
}
