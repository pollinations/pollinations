import { z } from "zod";

function finiteRoot(value) {
    if (!Number.isFinite(value))
        throw new Error("a root is outside the finite number range.");
    return Object.is(value, -0) ? 0 : value;
}

function root(real, imaginary = 0) {
    return {
        real: finiteRoot(real),
        imaginary: finiteRoot(imaginary),
    };
}

function solve(a, b, c) {
    if (a === 0) {
        if (b === 0)
            return c === 0
                ? { kind: "all-real", roots: null }
                : { kind: "no-solution", roots: [] };
        return { kind: "linear", roots: [root(-c / b)] };
    }

    // Scale first so b² and 4ac do not overflow for large finite inputs.
    const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c));
    const A = a / scale;
    const B = b / scale;
    const C = c / scale;
    if ((a !== 0 && A === 0) || (b !== 0 && B === 0) || (c !== 0 && C === 0))
        throw new Error(
            "the coefficient range exceeds reliable floating-point precision.",
        );

    const bSquared = B * B;
    const fourAC = 4 * A * C;
    if ((B !== 0 && bSquared === 0) || (A !== 0 && C !== 0 && fourAC === 0))
        throw new Error(
            "the coefficient range exceeds reliable floating-point precision.",
        );

    let discriminant = bSquared - fourAC;
    const tolerance = 8 * Number.EPSILON * (bSquared + Math.abs(fourAC));
    // Inputs cannot reliably distinguish the sign within a few rounding units.
    if (Math.abs(discriminant) <= tolerance) discriminant = 0;

    if (discriminant > 0) {
        const squareRoot = Math.sqrt(discriminant);
        // Choosing the sign that adds magnitudes avoids cancellation; the other
        // root follows from the product of roots.
        const q = -0.5 * (B + (B < 0 ? -squareRoot : squareRoot));
        const roots = [finiteRoot(q / A), finiteRoot(C / q)].sort(
            (left, right) => left - right,
        );
        return { kind: "two-real", roots: roots.map((value) => root(value)) };
    }

    if (discriminant === 0)
        return {
            kind: "repeated-real",
            roots: [root(-B / (2 * A))],
        };

    const real = -B / (2 * A);
    const imaginary = Math.sqrt(-discriminant) / (2 * Math.abs(A));
    return {
        kind: "complex",
        roots: [root(real, imaginary), root(real, -imaginary)],
    };
}

export const quadraticTools = [
    [
        "solve_quadratic",
        "Solve a·x² + b·x + c = 0. Returns `kind` (two-real, repeated-real, complex, linear, all-real, or no-solution) and roots as {real, imaginary} pairs. `roots` is null when every real number is a solution and empty when none are. Values too far apart for reliable finite-number results are rejected.",
        {
            a: z
                .number()
                .finite()
                .describe(
                    "Coefficient of x²; zero reduces the equation to a linear or degenerate case.",
                ),
            b: z.number().finite().describe("Coefficient of x."),
            c: z.number().finite().describe("Constant term."),
        },
        ({ a, b, c }) => solve(a, b, c),
    ],
];
