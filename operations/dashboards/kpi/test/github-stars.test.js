import { expect, it } from "vitest";
import { buildStarWeeks } from "../src/lib/githubStars";

it("uses Monday boundaries, retains unstars, and shows current partial growth", () => {
    expect(
        buildStarWeeks(
            [
                { date: "2026-09-14", stars: 100 },
                { date: "2026-09-20", stars: 999 },
                { date: "2026-09-21", stars: 120 },
                { date: "2026-09-28", stars: 115 },
                { date: "2026-09-29", stars: 118 },
            ],
            "2026-09-28",
        ),
    ).toEqual([
        { week: "2026-09-14", githubStars: 120, githubStarGrowth: 20 },
        { week: "2026-09-21", githubStars: 115, githubStarGrowth: -5 },
        { week: "2026-09-28", githubStars: 118, githubStarGrowth: 3 },
    ]);
});

it("does not fabricate weekly growth from missing or partial boundaries", () => {
    expect(buildStarWeeks([], "2026-09-28")).toEqual([]);
    expect(
        buildStarWeeks([{ date: "2026-09-29", stars: 100 }], "2026-09-28"),
    ).toEqual([]);
    expect(
        buildStarWeeks(
            [
                { date: "2026-09-14", stars: 100 },
                { date: "2026-09-28", stars: 150 },
            ],
            "2026-10-05",
        ),
    ).toEqual([
        { week: "2026-09-14", githubStars: undefined, githubStarGrowth: null },
        { week: "2026-09-28", githubStars: undefined, githubStarGrowth: null },
    ]);
});
