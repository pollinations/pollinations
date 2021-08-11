import matureWords from "./matureWords.json";

// replace all mature words by *
const mature = raw_input => matureWords.reduce((text, word) => text.replace(word, repeatChar("*", word.length)), raw_input);

// create a string of * of length n
const repeatChar = (c, n) => n === 0 ? c : c + repeatChar(c, n - 1)

// replace non-alphanumeric characters by spaces
const clean = raw_input => raw_input.replace(/[^a-zA-Z0-9]/g, " ");


export default text => mature(clean(text));
