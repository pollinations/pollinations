import { describe, expect, it } from "vitest";
import { flightPath } from "./PolliFlight";

describe("Polli's flight path", () => {
    const from = { x: 0, y: 500 };
    const to = { x: 600, y: 500 };

    it("starts where she is and ends on the perch", () => {
        const path = flightPath(from, to);
        expect(path).toHaveLength(12);
        expect(path[0]).toMatchObject(from);
        expect(path[path.length - 1]).toMatchObject(to);
    });

    it("arcs above the straight line between the ends", () => {
        const middle = flightPath(from, to)[6];
        expect(middle.y).toBeLessThan(500 - 100);
    });

    it("faces the way she flies", () => {
        expect(flightPath(from, to).every((p) => p.face === 1)).toBe(true);
        expect(flightPath(to, from).every((p) => p.face === -1)).toBe(true);
    });
});
