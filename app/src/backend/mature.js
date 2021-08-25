import {words} from "../data/matureWords.json";

// replace all mature words by *
const mature = raw_input => {
    try {
        return words.reduce((text, word) => text.replace(new RegExp(`\\b${word}\\b`,'g'), repeatChar("*", word.length-1)), raw_input);
    } catch (e) {
        console.error("Error when applying maturity filter", e);
        return raw_input;
    }
}

// create a string of * of length n
const repeatChar = (c, n) => n === 0 ? c : c + repeatChar(c, n - 1)

export default text => mature(text);
