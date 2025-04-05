import { words } from "../config/matureWords.js";

const wordsSet = new Set([...words, ...words.map(word => word + "s")]);

export const isMature = raw_input => { 
    // Convert input to lowercase for case-insensitive matching
    const input = raw_input.toLowerCase();
    
    // First check the original word-boundary based approach
    const inputWords = input.replaceAll("_"," ").split(/\b/);
    if (inputWords.find(inputWord => wordsSet.has(inputWord))) {
        return true;
    }
    
    // Then check if any mature word is a substring of the input
    return words.some(word => input.includes(word.toLowerCase()));
};
