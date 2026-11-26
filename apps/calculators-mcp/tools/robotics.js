import { z } from "zod";

// Two-link planar arm, joint angles measured from +x and relative to link one.
export function inversePlanarArm({ x, y, link1, link2 }) {
    if (![x, y, link1, link2].every(Number.isFinite) || link1 <= 0 || link2 <= 0) {
        throw new Error("Coordinates must be finite and link lengths must be positive.");
    }
    // Normalize to avoid overflow in squares when all lengths are very large.
    const scale = Math.max(Math.abs(x), Math.abs(y), link1, link2);
    const [a, b, px, py] = [link1 / scale, link2 / scale, x / scale, y / scale];
    if (a === 0 || b === 0 || a * b === 0) throw new Error("Link lengths differ too much to calculate reliably.");
    const d = Math.hypot(px, py);
    const epsilon = 1e-12 * Math.max(a, b);
    if (d > a + b + epsilon || d < Math.abs(a - b) - epsilon) return { reachable: false, solutions: [] };
    if (d === 0 && a === b) return { reachable: true, singular: true, solutions: [], message: "Infinitely many solutions: equal links fold at the origin." };
    const cosine = Math.max(-1, Math.min(1, (d * d - a * a - b * b) / (2 * a * b)));
    const theta = Math.acos(cosine);
    const angles = theta < 1e-12 || Math.PI - theta < 1e-12 ? [theta] : [theta, -theta];
    return {
        reachable: true,
        singular: angles.length === 1,
        solutions: angles.map((joint2) => ({
            joint1_radians: Math.atan2(py, px) - Math.atan2(b * Math.sin(joint2), a + b * Math.cos(joint2)),
            joint2_radians: joint2,
        })),
    };
}

export const roboticsTools = [[
    "inverse_planar_arm",
    "Compute the two elbow configurations of a two-link planar arm for a target (x,y). Angles are radians: joint1 is absolute from +x, joint2 is relative. Lengths and coordinates must use the same unit. Does not enforce joint limits or collisions.",
    {
        x: z.number().finite().describe("Target x coordinate."),
        y: z.number().finite().describe("Target y coordinate."),
        link1: z.number().positive().finite().describe("First link length."),
        link2: z.number().positive().finite().describe("Second link length."),
    },
    inversePlanarArm,
]];
