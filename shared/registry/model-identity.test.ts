import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { AUDIO_SERVICES } from "./audio";
import { EMBEDDING_SERVICES } from "./embeddings";
import { IMAGE_SERVICES } from "./image";
import { MODEL3D_SERVICES } from "./model3d";
import { REALTIME_SERVICES } from "./realtime";
import { TEXT_SERVICES } from "./text";

const root = fileURLToPath(new URL("../../", import.meta.url));
const retiredPath = "shared/registry/retired-model-ids.json";
const catalogs = {
    text: TEXT_SERVICES,
    image: IMAGE_SERVICES,
    audio: AUDIO_SERVICES,
    embeddings: EMBEDDING_SERVICES,
    realtime: REALTIME_SERVICES,
    model3d: MODEL3D_SERVICES,
};

// Read the base revision without executing old code or requiring a second checkout.
function publicIdsInSource(source: string): string[] {
    const file = ts.createSourceFile(
        "registry.ts",
        source,
        ts.ScriptTarget.Latest,
        true,
    );
    const declarations = new Map<string, ts.Expression>();
    for (const statement of file.statements) {
        if (!ts.isVariableStatement(statement)) continue;
        for (const declaration of statement.declarationList.declarations) {
            if (ts.isIdentifier(declaration.name) && declaration.initializer) {
                declarations.set(
                    declaration.name.text,
                    declaration.initializer,
                );
            }
        }
    }
    const resolve = (expression: ts.Expression): ts.Expression => {
        if (
            ts.isAsExpression(expression) ||
            ts.isSatisfiesExpression(expression)
        )
            return resolve(expression.expression);
        if (ts.isIdentifier(expression)) {
            const value = declarations.get(expression.text);
            if (!value)
                throw new Error(`Unknown registry constant ${expression.text}`);
            return resolve(value);
        }
        return expression;
    };
    const catalog = [...declarations].find(
        ([name, initializer]) =>
            name.endsWith("_SERVICES") &&
            ts.isObjectLiteralExpression(resolve(initializer)),
    );
    if (!catalog) throw new Error("Missing public registry object");
    const object = resolve(catalog[1]);
    if (!ts.isObjectLiteralExpression(object))
        throw new Error("Expected registry object");
    return object.properties.map((property) => {
        if (!ts.isPropertyAssignment(property))
            throw new Error("Expected explicit model entry");
        const name = ts.isComputedPropertyName(property.name)
            ? resolve(property.name.expression)
            : property.name;
        if (!ts.isStringLiteral(name))
            throw new Error("Expected literal model ID");
        return name.text;
    });
}

function assertLifecycle(
    previous: string[],
    current: string[],
    previouslyRetired: string[],
    retired: string[],
    aliases: string[],
) {
    expect(
        new Set(current).size,
        "Public IDs must be unique across all modalities",
    ).toBe(current.length);
    expect(new Set(retired).size, "Duplicate retired IDs").toBe(retired.length);
    for (const id of [
        ...previouslyRetired,
        ...previous.filter((id) => !current.includes(id)),
    ]) {
        expect(
            retired,
            `Keep removed ID ${id} permanently in ${retiredPath}`,
        ).toContain(id);
    }
    for (const id of retired) {
        expect(
            [...current, ...aliases],
            `Retired ID ${id} cannot identify another model, even as an alias`,
        ).not.toContain(id);
    }
}

describe("permanent public model IDs", () => {
    it("prevents duplicate IDs, missing retirements, unretirement, and alias reuse", () => {
        expect(() => assertLifecycle([], ["p/a", "p/a"], [], [], [])).toThrow();
        expect(() => assertLifecycle(["p/a"], [], [], [], [])).toThrow();
        expect(() => assertLifecycle([], [], ["p/a"], [], [])).toThrow();
        expect(() =>
            assertLifecycle([], ["p/a"], ["p/a"], ["p/a"], []),
        ).toThrow();
        expect(() =>
            assertLifecycle([], ["p/b"], ["p/a"], ["p/a"], ["p/a"]),
        ).toThrow();
        assertLifecycle(["p/a"], ["p/b"], [], ["p/a"], ["latest"]);
    });

    it("reserves removed IDs permanently while allowing provider and price changes", () => {
        // CI checks the PR merge against its first parent, including with shallow checkout.
        const base =
            process.env.GITHUB_ACTIONS === "true" ? "HEAD^1" : "origin/main";
        const git = (...args: string[]) =>
            execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
        const previous = Object.keys(catalogs).flatMap((name) =>
            publicIdsInSource(
                git("show", `${base}:shared/registry/${name}.ts`),
            ),
        );
        const current = Object.entries(catalogs).flatMap(([name, entries]) => {
            const ids = Object.keys(entries).filter(
                (id) => !entries[id as keyof typeof entries].fallbackOnly,
            );
            // The historical parser must agree with the actual compiled registry.
            expect(
                publicIdsInSource(
                    readFileSync(`${root}/shared/registry/${name}.ts`, "utf8"),
                ),
            ).toEqual(ids);
            return ids;
        });
        const previouslyRetired = git(
            "ls-tree",
            "--name-only",
            base,
            "--",
            retiredPath,
        )
            ? JSON.parse(git("show", `${base}:${retiredPath}`))
            : [];
        const retired = JSON.parse(
            readFileSync(`${root}/${retiredPath}`, "utf8"),
        );
        const aliases = Object.values(catalogs).flatMap((catalog) =>
            Object.values(catalog).flatMap((entry) => entry.aliases),
        );
        assertLifecycle(previous, current, previouslyRetired, retired, aliases);
    });
});
