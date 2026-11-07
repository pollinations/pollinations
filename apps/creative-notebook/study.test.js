import assert from "node:assert/strict";
import { test } from "node:test";
import {
    defaults,
    exportStudy,
    imageUrl,
    parametersFor,
    savedPreview,
} from "./study.js";

test("prompt composition and requests contain only explicit generation inputs", () => {
    const parameters = parametersFor({
        ...defaults,
        subject: "  ferns & circuits  ",
        apiKey: "do-not-export",
    });
    assert.equal(
        parameters.prompt,
        "ferns & circuits. cyanotype, botanical study, no lettering.",
    );
    const url = new URL(imageUrl({ ...parameters, apiKey: "do-not-export" }));
    assert.equal(
        decodeURIComponent(url.pathname),
        `/image/${parameters.prompt}`,
    );
    assert.equal(url.searchParams.get("model"), defaults.model);
    assert.equal(url.searchParams.has("key"), false);
    for (const seed of [-1, 1.5, 2147483648, NaN]) {
        assert.throws(() => parametersFor({ ...defaults, seed }), /Seed/);
    }
    assert.throws(
        () => parametersFor({ ...defaults, subject: " " }),
        /subject/,
    );
});

test("saved image bank export excludes credentials and internal request state", () => {
    const exported = exportStudy({
        ...savedPreview,
        apiKey: "do-not-export",
        parameters: {
            ...savedPreview.parameters,
            Authorization: "do-not-export",
        },
    });
    assert.equal(exported.images[0].url, savedPreview.images[0].url);
    assert.ok(exported.images[0].url.startsWith("data:image/svg+xml"));
    assert.ok(!JSON.stringify(exported).includes("do-not-export"));
    assert.deepEqual(exported.source, [
        "notebook.html",
        "study.js",
        "package.json",
        "study.test.js",
    ]);
});
