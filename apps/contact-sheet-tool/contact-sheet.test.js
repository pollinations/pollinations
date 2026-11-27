import assert from "node:assert/strict";
import test from "node:test";
import { gridLayout, validateBank } from "./contact-sheet.js";

test("a partial last row stays inside the canvas without overlapping captions", () => {
    const { width, height, cells } = gridLayout(7, 3);
    assert.equal(cells.length, 7);
    assert.equal(cells[6].x, cells[0].x);
    assert.ok(cells[3].y > cells[0].y + cells[0].height + 24);
    for (const cell of cells) {
        assert.ok(cell.x + cell.width < width);
        assert.ok(cell.y + cell.height + 24 < height);
    }
    assert.equal(gridLayout(1, 6).width, gridLayout(1, 1).width);
    for (const columns of [0, 1.5, 7, NaN])
        assert.throws(() => gridLayout(3, columns));
    assert.throws(() => gridLayout(25));
});

test("banks remain plain data and reject executable or credential-bearing sources", () => {
    const bank = {
        images: [
            {
                url: "https://media.pollinations.ai/example.png",
                caption: "<b>plain text</b>",
                unused: true,
            },
        ],
    };
    assert.deepEqual(validateBank(bank), {
        images: [{ url: bank.images[0].url, caption: "<b>plain text</b>" }],
    });
    assert.equal(
        validateBank({ images: [{ url: "data:image/png;base64,AAAA" }] })
            .images[0].caption,
        "",
    );
    for (const url of [
        "javascript:alert(1)",
        "file:///tmp/a.png",
        "data:text/html;base64,AAAA",
        "blob:https://example.com/id",
        "https://user:secret@example.com/a.png",
        "https://example.com/a.png?api_key=secret",
        "https://example.com/a.png?access_token=secret",
    ]) {
        assert.throws(() => validateBank({ images: [{ url }] }), url);
    }
    assert.throws(() => validateBank({ images: [] }));
    assert.throws(() =>
        validateBank({ images: Array(25).fill(bank.images[0]) }),
    );
    const caption = "A reusable prompt. ".repeat(50);
    const svg = `data:image/svg+xml,${encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10" fill="red"/></svg>')}`;
    assert.deepEqual(
        validateBank({ images: [{ url: svg, caption }] }).images[0],
        { url: svg, caption },
    );
    assert.equal(
        validateBank({
            images: [
                {
                    url: "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
                },
            ],
        }).images.length,
        1,
    );
    assert.throws(() =>
        validateBank({
            images: [
                {
                    url: `data:image/png;base64,${"A".repeat(16 * 1024 * 1024)}`,
                },
            ],
        }),
    );
});
