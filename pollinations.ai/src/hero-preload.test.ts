import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, test } from "vitest";
import { ART_SET, HERO_IMAGE_SIZES } from "./art-config";

// Execute the actual inline bootstrap, not a separate implementation of it.
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
if (!script) throw new Error("Missing initial theme/hero bootstrap");
const bootstrap = script
    .replace(/__ART_SET__/g, ART_SET)
    .replace(/__HERO_IMAGE_SIZES__/g, HERO_IMAGE_SIZES);

function runBootstrap(
    pathname: string,
    saved: string | null,
    darkSystem: boolean,
    blockedStorage = false,
) {
    const links: Record<string, string>[] = [];
    const classes: string[] = [];
    runInNewContext(bootstrap, {
        location: { pathname },
        localStorage: {
            getItem() {
                if (blockedStorage) throw new Error("Storage unavailable");
                return saved;
            },
        },
        window: { matchMedia: () => ({ matches: darkSystem }) },
        document: {
            documentElement: {
                classList: { add: (name: string) => classes.push(name) },
            },
            createElement: (tag: string) => {
                expect(tag).toBe("link");
                return {};
            },
            head: {
                appendChild: (link: Record<string, string>) => links.push(link),
            },
        },
    });
    return { links, classes };
}

describe("early responsive hero preload", () => {
    test.each([
        ["/", "home"],
        ["/play", "play"],
        ["/apps", "apps"],
        ["/community", "community"],
        ["/PLAY/", "play"],
    ])("preloads exactly one matching hero for %s in either theme", (path, page) => {
        for (const mode of ["light", "dark"]) {
            // Saved preference must win even when the OS preference disagrees.
            const { links, classes } = runBootstrap(
                path,
                mode,
                mode === "light",
            );
            const base = `/art/${ART_SET}/${page}-hero-${mode === "dark" ? "night" : "day"}`;
            expect(links).toEqual([
                {
                    rel: "preload",
                    as: "image",
                    type: "image/webp",
                    fetchPriority: "high",
                    imageSrcset: `${base}-1024.webp 1024w, ${base}.webp 2048w`,
                    imageSizes: HERO_IMAGE_SIZES,
                    href: `${base}.webp`,
                },
            ]);
            expect(classes).toEqual(mode === "dark" ? ["dark"] : []);
        }
    });

    test.each([
        null,
        "invalid",
    ])("uses the system theme when saved mode is %s", (saved) => {
        for (const dark of [false, true]) {
            const { links } = runBootstrap("/", saved, dark);
            expect(links[0].href).toBe(
                `/art/${ART_SET}/home-hero-${dark ? "night" : "day"}.webp`,
            );
        }
    });

    test("blocked storage still allows the system theme and preload", () => {
        const { links, classes } = runBootstrap("/", "light", true, true);
        expect(classes).toEqual(["dark"]);
        expect(links).toHaveLength(1);
        expect(links[0].href).toContain("home-hero-night.webp");
    });

    test.each([
        "/terms",
        "/privacy",
        "/refunds",
        "/missing",
        "/play/missing",
    ])("does not preload unrelated artwork on %s", (path) => {
        expect(runBootstrap(path, "light", false).links).toEqual([]);
    });
});
