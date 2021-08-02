import {nouns, adjectives, artists} from './promptData.json'
import {intersperse} from "ramda";
import shuffle from "lodash.shuffle"
import random from "lodash.random"

const generatePromptSkeleton = () => ([random(2, 3), random(1, 2)]);
const connectives = [[","],["on a","in a","on top of a","under a"]];
const capitalize = s => s && s[0].toUpperCase() + s.slice(1)

export const buildPrompt = () => {
    // We shuffle the prompt words once so we don't get duplicates.
    const promptWords = [shuffle(adjectives), shuffle(nouns)];
    const promptSkeletonWithWords = generatePromptSkeleton().map((val,idx) => promptWords[idx].splice(0,val))
    // We can shuffle the connectives on the fly because they can be repeated
    const generatedPromptArray = promptSkeletonWithWords.map((val, idx)=>(intersperse(shuffle(connectives[idx]).pop(),val))).flat()
    const generatedPromotWithStyleArray = random(0,1) > 0 ? generatedPromptArray.concat(["in style of " + shuffle(artists).pop()]) : generatedPromptArray
    const generatedPrompt = capitalize(generatedPromotWithStyleArray.join(" "))
    return generatedPrompt
}
