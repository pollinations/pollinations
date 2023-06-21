import { words } from "./matureWords.js";

// // replace all mature words by *
// const mature = raw_input => {
//     try {
//         return words.reduce((text, word) => text.replace(new RegExp(`\\b${word}\\b`,'g'), repeatChar("*", word.length-1)), raw_input);
//     } catch (e) {
//         console.error("Error when applying maturity filter", e);
//         return raw_input;
//     }
// }

// // create a string of * of length n
// const repeatChar = (c, n) => n === 0 ? c : c + repeatChar(c, n - 1)


// export a function that returns true if a mature word is found in the text
// export const isMature = raw_input => words.find(word => raw_input.toLowerCase().includes(word.toLowerCase()));

// use \\b${word}\\b to match only whole words

const wordsSet = new Set([...words, ...words.map(word => word + "s")]);

export const isMature = raw_input => { 
    console.log("checking for mature words in", raw_input);
    
    const inputWords = raw_input.toLowerCase()
        .replaceAll("_"," ")
        // replace all numbers with space
        .replaceAll(/\d/g, " ")
        .split(/\b/);
    return inputWords.find(inputWord => wordsSet.has(inputWord));
};

