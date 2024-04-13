import { words } from "./matureWords.js";

const wordsSet = new Set([...words, ...words.map(word => word + "s")]);

export const isMature = raw_input => { 
    const inputWords = raw_input.toLowerCase().replaceAll("_"," ").split(/\b/);
    return inputWords.find(inputWord => wordsSet.has(inputWord));
};

