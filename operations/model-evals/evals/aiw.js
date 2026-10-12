import { randomInt } from "../lib/rng.js";

// LAION's "Alice in Wonderland" puzzles (https://github.com/LAION-AI/AIW,
// Apache-2.0): trivially easy for a person, hard for many LLMs. Wording follows
// the repository's STANDARD prompts; only the numbers change, so every run asks
// fresh questions and a memorised or cached answer is worthless.
const FORM = 'the final answer in following form: "### Answer: ".';

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

const FAMILIES = {
    // Alice has B brothers and S sisters; her brother's sisters are Alice + S.
    aiw: (rng) => {
        const brothers = randomInt(rng, 2, 8);
        const sisters = randomInt(rng, 1, 8);
        return {
            prompt: `Alice has ${plural(brothers, "brother", "brothers")} and she also has ${plural(sisters, "sister", "sisters")}. How many sisters does Alice's brother have? Solve this problem and provide ${FORM}`,
            answer: sisters + 1,
        };
    },
    // Cousins come from both sides; the mother's sister has none of her own, and
    // Alice's family (Alice + her sisters) counts among the aunt's/uncle's
    // nephews and nieces, so it is subtracted from each total.
    "aiw-plus": (rng) => {
        const sisters = randomInt(rng, 2, 5);
        const family = sisters + 1;
        const maternal = randomInt(rng, 2, 5);
        const paternal = randomInt(rng, 1, 4);
        const sons = randomInt(rng, 1, 3);
        const uncles = randomInt(rng, 2, 3);
        return {
            prompt: `Alice has ${sisters} sisters. Her mother has 1 sister who does not have children - she has ${family + maternal} nephews and nieces and also ${uncles} brothers. Alice's father has a brother who has ${family + paternal} nephews and nieces in total, and who has also ${plural(sons, "son", "sons")}. How many cousins does Alice's sister have? Solve this problem and provide ${FORM}`,
            answer: maternal + paternal + sons,
        };
    },
    // The big bowl is blue too, so it joins the blue bowls next to it.
    bowls: (rng) => {
        const red = randomInt(rng, 2, 9);
        const blue = randomInt(rng, 2, 12);
        return {
            prompt: `On a table, there is a big bowl, next to this bowl, which is blue, there are ${red} red bowls and ${blue} blue bowls on the table. How many blue bowls are on the table with red bowls? Provide ${FORM}`,
            answer: blue + 1,
        };
    },
};

const ANSWER = /###\s*Answer\s*:\s*[*_"'`\s]*(-?\d+)/gi;

export default {
    id: "aiw",
    title: "Alice in Wonderland",
    source: "https://github.com/LAION-AI/AIW",
    families: Object.keys(FAMILIES),

    /** `samples` fresh questions per family, drawn from the seeded `rng`. */
    questions({ rng, samples }) {
        return Object.entries(FAMILIES).flatMap(([family, make]) =>
            Array.from({ length: samples }, () => ({ family, ...make(rng) })),
        );
    },

    /** Graded by code: the last "### Answer:" in the reply must be the number. */
    grade(text, question) {
        const matches = [...String(text ?? "").matchAll(ANSWER)];
        return (
            matches.length > 0 &&
            Number(matches[matches.length - 1][1]) === question.answer
        );
    },
};
