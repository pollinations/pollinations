export const FAMILY_NAMES = ["aiw", "aiw_plus", "bowls"];

const FINAL_ANSWER =
    "Think it through. End with a separate line exactly: Final answer: <integer>";

function randomInt(rng, min, max) {
    return min + Math.floor(rng() * (max - min + 1));
}

function gradeInteger(raw, expected) {
    if (typeof raw !== "string" || raw.trim() === "") return false;
    const explicit = raw.match(/final\s*answer\s*[:=]\s*(-?\d+)/i);
    const integers = raw.match(/-?\d+/g);
    const candidate = explicit?.[1] ?? integers?.at(-1);
    return candidate !== undefined && Number(candidate) === expected;
}

const FAMILIES = {
    aiw: {
        generate(rng) {
            const brothers = randomInt(rng, 1, 7);
            const sisters = randomInt(rng, 1, 7);
            return {
                prompt:
                    `Alice has ${brothers} brothers and ${sisters} sisters. ` +
                    `How many sisters does one of Alice's brothers have? ${FINAL_ANSWER}`,
                answer: sisters + 1,
            };
        },
        grade: gradeInteger,
    },
    aiw_plus: {
        generate(rng) {
            const brothers = randomInt(rng, 1, 7);
            const sisters = randomInt(rng, 1, 7);
            const fatherSisters = randomInt(rng, 1, 5);
            const motherBrothers = randomInt(rng, 1, 5);
            return {
                prompt:
                    `Alice has ${brothers} brothers and ${sisters} sisters. ` +
                    `Alice's father has ${fatherSisters} sisters, and Alice's mother ` +
                    `has ${motherBrothers} brothers. How many sisters does one of ` +
                    `Alice's brothers have? ${FINAL_ANSWER}`,
                answer: sisters + 1,
            };
        },
        grade: gradeInteger,
    },
    bowls: {
        generate(rng) {
            const empty = randomInt(rng, 1, 3);
            const ordinary = randomInt(rng, 2, 6);
            const ordinaryFruit = randomInt(rng, 2, 9);
            const specialFruit = randomInt(rng, 1, 9);
            const total = empty + ordinary + 1;
            return {
                prompt:
                    `There are ${total} bowls on a table. ${empty} are empty. ` +
                    `Of the non-empty bowls, ${ordinary} each contain ${ordinaryFruit} ` +
                    `pieces of fruit and one contains ${specialFruit}. How many pieces ` +
                    `of fruit are on the table? ${FINAL_ANSWER}`,
                answer: ordinary * ordinaryFruit + specialFruit,
            };
        },
        grade: gradeInteger,
    },
};

export function generateQuestion(family, rng) {
    const definition = FAMILIES[family];
    if (!definition) throw new Error(`Unknown eval family: ${family}`);
    return { family, ...definition.generate(rng) };
}

export function gradeQuestion(family, raw, expected) {
    const definition = FAMILIES[family];
    if (!definition) throw new Error(`Unknown eval family: ${family}`);
    return definition.grade(raw, expected);
}
