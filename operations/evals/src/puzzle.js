// Alice in Wonderland (AIW) evaluation questions and code grading.
// Ported from LAION-AI/AIW (Apache-2.0): https://github.com/LAION-AI/AIW
//
// Every question family is generated with fresh random numbers on each run,
// so cached or memorised answers do not count. The answer is computed in code.

const ANSWER_FORMAT =
    "To answer the question, DO NOT OUTPUT ANY TEXT EXCEPT following format that contains final answer: ### Answer:";

/** Extract the graded answer from a model reply: text after the last "### Answer:". */
export function extractAnswer(reply) {
    if (typeof reply !== "string") return null;
    const marker = "### Answer:";
    const at = reply.lastIndexOf(marker);
    const tail = at === -1 ? reply : reply.slice(at + marker.length);
    const tokens = tail.match(/-?\d+/g);
    return tokens ? tokens[tokens.length - 1] : null;
}

export function grade(reply, expected) {
    return extractAnswer(reply) === String(expected);
}

/** Fantasy name for the AIW+ family, cycled by index for variety. */
const NAMES = ["Alice", "Bob", "Haret", "Matilda", "Carroll"];

/**
 * The AIW question families. Each takes an RNG and a name index and returns
 * { prompt, expected }.
 */

// "Alice has B brothers and she also has S sisters. How many sisters does Alice's brother have?"
export function aiw(rng, name = "Alice") {
    const brothers = rng.int(2, 6);
    const sisters = rng.int(1, 6);
    const expected = sisters + 1; // Alice herself is one of the sisters.
    return {
        family: "aiw",
        prompt: `${name} has ${brothers} brothers and she also has ${sisters} ${sisters === 1 ? "sister" : "sisters"}. How many sisters does ${name}'s brother have? ${ANSWER_FORMAT}`,
        expected,
    };
}

// AIW+ : cousins puzzle. Count the children of aunts/uncles on both sides.
// Cousins are the same for Alice and her sister, so the answer is a constant
// for the question, computed in code.
export function aiwPlus(rng, name = "Alice") {
    const sisters = rng.int(1, 3);
    const motherSiblings = rng.int(1, 3);
    const motherKids = rng.int(0, 3);
    const fatherSiblings = rng.int(1, 3);
    const fatherKids = rng.int(0, 3);
    const cousins = motherSiblings * motherKids + fatherSiblings * fatherKids;
    const childrenLine = (n) =>
        n === 0 ? "none of them has children" : n === 1 ? "each of them has 1 child" : `each of them has ${n} children`;
    return {
        family: "aiw+",
        prompt:
            `${name} has ${sisters} ${sisters === 1 ? "sister" : "sisters"}. ` +
            `${name}'s mother has ${motherSiblings} ${motherSiblings === 1 ? "sibling" : "siblings"} on ${name}'s grandparent's side, and ${childrenLine(motherKids)}. ` +
            `${name}'s father has ${fatherSiblings} ${fatherSiblings === 1 ? "sibling" : "siblings"} on ${name}'s grandparent's side, and ${childrenLine(fatherKids)}. ` +
            `How many cousins does ${name}'s sister have? ${ANSWER_FORMAT}`,
        expected: cousins,
    };
}

// "Bowls": count objects in a described scene. Simple, code-graded.
export function bowls(rng, name = "Alice") {
    const blue = rng.int(2, 7);
    const red = rng.int(1, 5);
    const expected = blue + red;
    return {
        family: "bowls",
        prompt:
            `${name} puts ${blue} blue ${blue === 1 ? "bowl" : "bowls"} on the table and then ${red} red ${red === 1 ? "bowl" : "bowls"}. ` +
            `How many bowls are on the table in total? ${ANSWER_FORMAT}`,
        expected,
    };
}

export const FAMILIES = { aiw, aiwPlus, bowls };
export const FAMILY_NAMES = Object.keys(FAMILIES);
export { NAMES };
