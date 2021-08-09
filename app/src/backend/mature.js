import readJson from "../utils/readJson"

const matureWords = readJson("src/backend/matureWords.json")["words"];

const repeatChar = (c, n) => n === 0 ? c : c + repeatChar(c, n - 1)

const mature = raw_input => matureWords.reduce((text, word) => text.replace(word, repeatChar("*", word.length)), raw_input);

export default mature;
