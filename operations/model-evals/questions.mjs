// AIW (Alice in Wonderland) eval question families.
//
// All three families come from the LAION AIW benchmark (Apache-2.0):
// https://github.com/LAION-AI/AIW — "Alice in Wonderland: A Simple
// Case of Conceptual Reasoning Breakdown in Large Language Models"
// (https://arxiv.org/abs/2406.02061). Prompts are regenerated with fresh
// numbers on every run so cached or memorised answers never count, and
// every answer is computed by code, never by an LLM.
//
// Adding a second eval later only needs its own module exporting the
// same shape as the families below: a name and a generate(rng) that
// returns { prompt, answer, meta }.

const FEMALE_NAMES = ["Alice", "Diana", "Eve", "Grace", "Ivy", "Karen", "Mona"];
const MALE_NAMES = ["Bob", "Charlie", "Frank", "Henry", "Jack", "Leo", "Noah"];

const NUMBER_WORDS = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
];

function numberOrWord(rng, n, useWords) {
    if (useWords && n < NUMBER_WORDS.length && rng() < 0.5) {
        return NUMBER_WORDS[n];
    }
    return String(n);
}

function plural(count, singular, pluralWord) {
    return count === 1 ? singular : pluralWord;
}

function answerSuffix() {
    return 'Solve this problem and provide the final answer in following form: "### Answer: ".';
}

// The classic AIW prompt: a subject with N sisters and M brothers, asked
// how many siblings of one kind the opposite-kind sibling has. The trap
// is remembering to include the subject themself when the subject
// belongs to the asked-about group.
function generateAiw(rng) {
    const female = rng() < 0.5;
    const pool = female ? FEMALE_NAMES : MALE_NAMES;
    const name = pool[Math.floor(rng() * pool.length)];
    const sisters = 1 + Math.floor(rng() * 7);
    const brothers = 1 + Math.floor(rng() * 7);
    const useWords = rng() < 0.3;
    const askSisters = rng() < 0.5;

    const sistersText = `${numberOrWord(rng, sisters, useWords)} ${plural(sisters, "sister", "sisters")}`;
    const brothersText = `${numberOrWord(rng, brothers, useWords)} ${plural(brothers, "brother", "brothers")}`;
    const alsoText = female ? "she also has" : "he also has";

    let question;
    let answer;
    if (askSisters) {
        question = `How many sisters does ${name}'s brother have?`;
        // A brother's sisters are the subject's sisters, plus the subject
        // herself when the subject is female.
        answer = female ? sisters + 1 : sisters;
    } else {
        question = `How many brothers does ${name}'s sister have?`;
        // A sister's brothers are the subject's brothers, plus the subject
        // himself when the subject is male.
        answer = female ? brothers : brothers + 1;
    }

    const prompt = `${name} has ${sistersText} and ${alsoText} ${brothersText}. ${question} ${answerSuffix()}`;
    return {
        prompt,
        answer,
        meta: { family: "aiw", sisters, brothers, subject: name },
    };
}

// AIW+ prompt (LAION's harder cousin-counting variant): a fully specified
// family tree where the correct answer needs several relation hops. The
// tree is built explicitly so every stated count is consistent, then the
// question asks for the subject's sibling's cousins:
//   cousins = mother's brothers' children + father's sisters' children +
//             uncle's children
// The subject's siblings (girls including the subject are nieces, boys are
// nephews of the aunt and the uncle) are subtracted from the stated totals
// by the solver; only the remaining children are cousins.
function generateAiwPlus(rng) {
    const name = FEMALE_NAMES[Math.floor(rng() * FEMALE_NAMES.length)];
    const sisters = 1 + Math.floor(rng() * 3);
    const brothers = Math.floor(rng() * 3);
    const motherBrothers = 2; // the aunt "also has 2 brothers"
    const mNephews = Math.floor(rng() * 3);
    const mNieces = 1 + Math.floor(rng() * 3);
    const fatherSisters = 2;
    const fNephews = Math.floor(rng() * 3);
    const fNieces = 1 + Math.floor(rng() * 3);
    const uncleHasSons = rng() < 0.5;
    const uncleChildren = 1 + Math.floor(rng() * 2);
    const uncleChildWord = uncleHasSons
        ? plural(uncleChildren, "son", "sons")
        : plural(uncleChildren, "daughter", "daughters");

    const familyNephews = brothers;
    const familyNieces = 1 + sisters;

    const auntNephews = familyNephews + mNephews;
    const auntNieces = familyNieces + mNieces;
    const uncleNephews = familyNephews + fNephews;
    const uncleNieces = familyNieces + fNieces;

    const siblingsText =
        brothers > 0
            ? `${sisters} ${plural(sisters, "sister", "sisters")} and ${brothers} ${plural(brothers, "brother", "brothers")} in total`
            : `${sisters} ${plural(sisters, "sister", "sisters")}`;

    const answer = mNephews + mNieces + fNephews + fNieces + uncleChildren;

    const prompt =
        `${name} has ${siblingsText}. ` +
        `Her mother has 1 sister who does not have children - she has ${auntNephews} ${plural(auntNephews, "nephew", "nephews")} and ${auntNieces} ${plural(auntNieces, "niece", "nieces")} in total and also ${motherBrothers} brothers. ` +
        `${name}'s father has ${fatherSisters} sisters. He also has a brother who has ${uncleNephews} ${plural(uncleNephews, "nephew", "nephews")} and ${uncleNieces} ${plural(uncleNieces, "niece", "nieces")} in total, ` +
        `and who also has ${uncleChildren} ${uncleChildWord}. ` +
        `How many cousins does ${name}'s sister have? ${answerSuffix()}`;

    return {
        prompt,
        answer,
        meta: {
            family: "aiw-plus",
            sisters,
            brothers,
            motherBrothersChildren: mNephews + mNieces,
            fatherSistersChildren: fNephews + fNieces,
            uncleChildren,
        },
    };
}

// Bowls prompt (LAION's "Bowls Variation 1"): a big bowl plus colored
// bowls on the table. The trap is remembering the big bowl when it has
// the asked-about color. The big bowl never shares the distractor color,
// so "besides the {distractor} bowls" stays unambiguous.
function generateBowls(rng) {
    const colors = ["red", "blue", "green", "yellow"];
    const bigColor = colors[Math.floor(rng() * colors.length)];
    const askedColor = colors[Math.floor(rng() * colors.length)];
    let distractorColor = colors[Math.floor(rng() * colors.length)];
    while (distractorColor === bigColor || distractorColor === askedColor) {
        distractorColor = colors[Math.floor(rng() * colors.length)];
    }
    const askedBowlCount = 1 + Math.floor(rng() * 5);
    const distractorBowlCount = 1 + Math.floor(rng() * 5);

    // All bowls of the asked color on the table, besides the distractor
    // ones: the counted bowls plus the big bowl when it matches.
    const answer = askedBowlCount + (bigColor === askedColor ? 1 : 0);

    const prompt =
        `On a table, there is a big ${bigColor} bowl. ` +
        `In addition to this bowl there are ${distractorBowlCount} ${distractorColor} ${plural(distractorBowlCount, "bowl", "bowls")} and ${askedBowlCount} ${askedColor} ${plural(askedBowlCount, "bowl", "bowls")} on the table. ` +
        `How many ${askedColor} bowls are on the table besides the ${distractorColor} ${plural(distractorBowlCount, "bowl", "bowls")}? ${answerSuffix()}`;

    return {
        prompt,
        answer,
        meta: {
            family: "bowls",
            bigColor,
            askedColor,
            distractorColor,
            askedBowlCount,
            distractorBowlCount,
        },
    };
}

const FAMILIES = {
    aiw: { name: "aiw", title: "AIW", generate: generateAiw },
    "aiw-plus": { name: "aiw-plus", title: "AIW+", generate: generateAiwPlus },
    bowls: { name: "bowls", title: "Bowls", generate: generateBowls },
};

export const FAMILY_NAMES = Object.keys(FAMILIES);

export function isValidFamily(name) {
    return Object.hasOwn(FAMILIES, name);
}

export function familyTitle(name) {
    return FAMILIES[name]?.title ?? name;
}

// Generates one question for the family. rng must be a function returning
// floats in [0, 1); use the seeded rng from rng.mjs for reproducibility.
export function generateQuestion(familyName, rng) {
    const family = FAMILIES[familyName];
    if (!family) {
        throw new Error(
            `Unknown eval family: ${familyName}. Valid families: ${FAMILY_NAMES.join(", ")}`,
        );
    }
    const question = family.generate(rng);
    return {
        id: `${familyName}-${Math.floor(rng() * 1e9).toString(36)}`,
        family: familyName,
        ...question,
    };
}

export function generateQuestionSet({ families, questionsPerFamily, rng }) {
    const questions = [];
    for (const familyName of families) {
        for (let i = 0; i < questionsPerFamily; i++) {
            questions.push(generateQuestion(familyName, rng));
        }
    }
    return questions;
}
