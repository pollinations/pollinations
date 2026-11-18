import { z } from "zod";

// The GraphQL query string must be URL-encoded (the survey's trap: the raw
// braces in the query param). Only value + difficulty are requested — the
// solution exists upstream but is deliberately never fetched, so the tool
// hands an agent a puzzle to solve, not the answer.
const DOSUKU_URL =
    "https://sudoku-api.vercel.app/api/dosuku?query=" +
    encodeURIComponent("{newboard(limit:1){grids{value,difficulty}}}");

function parsePuzzle(grid) {
    if (!Array.isArray(grid?.value) || grid.value.length !== 9) return null;
    for (const row of grid.value) {
        if (!Array.isArray(row) || row.length !== 9) return null;
        for (const cell of row) {
            if (!Number.isInteger(cell) || cell < 0 || cell > 9) return null;
        }
    }
    return {
        grid: grid.value,
        difficulty:
            typeof grid.difficulty === "string" && grid.difficulty
                ? grid.difficulty
                : null,
    };
}

export const sudokuTools = [
    [
        "sudoku_puzzle",
        "Get a fresh random Sudoku puzzle from the Dosuku API (sudoku-api.vercel.app). One 9x9 grid per call with its difficulty (Easy/Medium/Hard); 0 marks an empty cell. The solution is never returned. One fetch per puzzle, in parallel.",
        {
            limit: z.number().int().min(1).max(10).default(1),
        },
        async ({ limit }, fetchJson) => {
            const n =
                Number.isInteger(limit) && limit >= 1 && limit <= 10
                    ? limit
                    : 1;
            const responses = await Promise.all(
                Array.from({ length: n }, () => fetchJson(DOSUKU_URL)),
            );
            const puzzles = [];
            for (const response of responses) {
                const grids = response?.newboard?.grids;
                if (!Array.isArray(grids) || grids.length === 0)
                    throw new Error("Dosuku returned no puzzle");
                const puzzle = parsePuzzle(grids[0]);
                if (!puzzle)
                    throw new Error("Dosuku returned a malformed puzzle grid");
                puzzles.push(puzzle);
            }
            return { limit: n, puzzles };
        },
    ],
];
