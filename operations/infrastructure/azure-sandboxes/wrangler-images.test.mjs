import assert from "node:assert/strict";
import { test } from "node:test";
import { pinImage } from "./wrangler-images.mjs";

const STAGING = "https://management.azure/pollisbx-staging";
const PROD = "https://management.azure/pollisbx-prod";
const NEW = "sha256-newimage";

const toml = (ending) =>
    [
        "[vars]",
        `AZURE_SANDBOX_GROUP_URL = "${STAGING}"`,
        'AZURE_SANDBOX_IMAGE = "sha256-old"',
        `AZURE_SANDBOX_GROUP_URL = "${PROD}"`,
        'AZURE_SANDBOX_IMAGE = "sha256-other"',
        "",
    ].join(ending);

test("pins the image of the named group", () => {
    const pinned = pinImage(toml("\n"), STAGING, NEW);
    assert.match(pinned, new RegExp(`AZURE_SANDBOX_IMAGE = "${NEW}"`));
    assert.match(pinned, /AZURE_SANDBOX_IMAGE = "sha256-other"/);
});

test("pins every block that reuses the group", () => {
    const twice = `${toml("\n")}${`AZURE_SANDBOX_GROUP_URL = "${STAGING}"\nAZURE_SANDBOX_IMAGE = "sha256-third"\n`}`;
    const pinned = pinImage(twice, STAGING, NEW);
    assert.equal(pinned.match(new RegExp(`"${NEW}"`, "g")).length, 2);
});

test("pins on a CRLF checkout, where an exact line compare never matches", () => {
    const pinned = pinImage(toml("\r\n"), STAGING, NEW);
    assert.match(pinned, /AZURE_SANDBOX_IMAGE = "sha256-newimage"/);
});

test("keeps the line endings the file already had", () => {
    const crlf = pinImage(toml("\r\n"), STAGING, NEW);
    assert.equal(crlf.split("\r\n").length, toml("\r\n").split("\r\n").length);
    assert.equal(crlf.match(/\r/g).length, toml("\r\n").match(/\r/g).length);

    const lf = pinImage(toml("\n"), STAGING, NEW);
    assert.doesNotMatch(lf, /\r/);
});

test("keeps the trailing newline", () => {
    assert.match(pinImage(toml("\n"), STAGING, NEW), /\n$/);
    assert.match(pinImage(toml("\r\n"), STAGING, NEW), /\r\n$/);
});

test("says so when the file does not name the group", () => {
    assert.throws(
        () =>
            pinImage(toml("\n"), "https://management.azure/pollisbx-gone", NEW),
        /no AZURE_SANDBOX_GROUP_URL line for/,
    );
});

test("says so when the group has no image line after it", () => {
    const noImage = `AZURE_SANDBOX_GROUP_URL = "${STAGING}"\nsomething_else = 1\n`;
    assert.throws(
        () => pinImage(noImage, STAGING, NEW),
        /no AZURE_SANDBOX_IMAGE line after/,
    );
});
