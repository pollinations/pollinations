/**
 * Random one-liners printed at the tail of login / logout / version output.
 *
 * Mostly Hitchhiker's-Guide-flavored with a bee/pollen twist — `flavor.login`
 * etc. resolve a fresh random pick on every access, so the CLI feels alive
 * across invocations without anyone needing to remember to pass a "mood" arg.
 *
 * Add freely; keep entries short (one line, ideally under 50 chars), playful
 * but not goofy, and consistent with the rest of the personality. Don't ship
 * anything that wouldn't fit on a Pollinations sticker.
 */

const LOGIN_QUOTES = [
    "Share and Enjoy.",
    "Don't Panic.",
    "Welcome to the hive.",
    "Pollen flowing. Time to bloom.",
    "May your prompts be bee-utiful.",
    "Buzz buzz. We're listening.",
    "The garden is open.",
    "Have your towel ready.",
    "All systems pollinated.",
    "Let the petals unfurl.",
    "Ready when you are.",
    "Time to make some pollen.",
];

const LOGOUT_QUOTES = [
    "So long, and thanks for all the pollen.",
    "See you on the next bloom.",
    "Until the next pollination.",
    "Catch you on the breeze.",
    "Off to the next flower.",
    "Wings down for now.",
    "Petals folded for the night.",
    "Hibernation engaged.",
    "Goodbye, dear bee.",
    "May your seeds prosper.",
    "Sleep tight, hive.",
];

const VERSION_QUOTES = [
    "Mostly harmless.",
    "Pollen-powered.",
    "Tested on real flowers.",
    "42 isn't the answer this time.",
    "Caffeinated by pollen.",
    "Buzzing along nicely.",
    "Built with bees in mind.",
    "Probably more useful than a towel.",
    "Made in a garden, by friends.",
    "Compiled by cuddly bees.",
];

const pick = <T>(pool: readonly T[]): T =>
    pool[Math.floor(Math.random() * pool.length)] as T;

/**
 * Resolve a fresh random quote on every property access. Existing call
 * sites that read `flavor.login` keep working unchanged — they just see a
 * different pick on each invocation.
 */
export const flavor = {
    get login(): string {
        return pick(LOGIN_QUOTES);
    },
    get logout(): string {
        return pick(LOGOUT_QUOTES);
    },
    get version(): string {
        return pick(VERSION_QUOTES);
    },
};
