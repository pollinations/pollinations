import assert from "node:assert/strict";
import { test } from "node:test";
import sharp from "sharp";
import {
    renderFavicon,
    renderOg,
    renderPaddedIcon,
    renderSolidIcon,
    tintLogo,
} from "../src/render.js";

const SVG =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" style="fill:currentColor"/></svg>';

test("tintLogo swaps currentColor for the given color", () => {
    const out = tintLogo(SVG, "#FEF3C7");
    assert.equal(out.includes("currentColor"), false);
    assert.equal(out.includes("#FEF3C7"), true);
});

test("renderFavicon is a transparent PNG at the requested size", async () => {
    const meta = await sharp(await renderFavicon(SVG, 32, "#FEF3C7")).metadata();
    assert.equal(meta.width, 32);
    assert.equal(meta.height, 32);
    assert.equal(meta.hasAlpha, true);
});

test("renderPaddedIcon is a transparent PNG at the requested size", async () => {
    const meta = await sharp(await renderPaddedIcon(SVG, 192, "#FEF3C7")).metadata();
    assert.equal(meta.width, 192);
    assert.equal(meta.height, 192);
    assert.equal(meta.hasAlpha, true);
});

test("renderSolidIcon has an opaque brand-colored background", async () => {
    const png = await renderSolidIcon(SVG, 180, { bg: "#FEF3C7", logoColor: "#110518" });
    const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true });
    const alpha = info.channels > 3 ? data[3] : 255;
    assert.equal(alpha, 255); // top-left corner is opaque
    // ...and matches the background #FEF3C7 = (254, 243, 199)
    assert.ok(Math.abs(data[0] - 254) <= 2);
    assert.ok(Math.abs(data[1] - 243) <= 2);
    assert.ok(Math.abs(data[2] - 199) <= 2);
});

test("renderOg is a 1200x630 PNG", async () => {
    const meta = await sharp(await renderOg(SVG, { bg: "#FEF3C7", logoColor: "#110518" })).metadata();
    assert.equal(meta.width, 1200);
    assert.equal(meta.height, 630);
});
