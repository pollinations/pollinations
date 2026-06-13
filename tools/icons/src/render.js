import sharp from "sharp";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** The @pollinations/ui logo paints with fill:currentColor. */
export function tintLogo(svg, color) {
    return svg.replaceAll("currentColor", color);
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!m) throw new Error(`Bad hex color: ${hex}`);
    return {
        r: Number.parseInt(m[1], 16),
        g: Number.parseInt(m[2], 16),
        b: Number.parseInt(m[3], 16),
    };
}

/**
 * Core: a tinted logo sized to `fraction` of the shorter side, centered on a
 * canvas. `bg` is a hex color (opaque background) or null (transparent).
 */
async function compose(
    svg,
    { width, height = width, bg = null, logoColor, fraction },
) {
    const logoSize = Math.round(Math.min(width, height) * fraction);
    const logo = await sharp(Buffer.from(tintLogo(svg, logoColor)))
        .resize(logoSize, logoSize, { fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer();
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: bg ? { ...hexToRgb(bg), alpha: 1 } : TRANSPARENT,
        },
    })
        .composite([
            {
                input: logo,
                top: Math.round((height - logoSize) / 2),
                left: Math.round((width - logoSize) / 2),
            },
        ])
        .png()
        .toBuffer();
}

/** Favicon: logo fills the square, transparent background. */
export function renderFavicon(svg, size, color) {
    return compose(svg, { width: size, logoColor: color, fraction: 1 });
}

/** "any" PWA icon: logo with a margin (so rounding never crops), transparent. */
export function renderPaddedIcon(svg, size, color, fraction = 0.65) {
    return compose(svg, { width: size, logoColor: color, fraction });
}

/** apple-touch / maskable icon: padded logo on a solid (opaque) background. */
export function renderSolidIcon(svg, size, { bg, logoColor, fraction = 0.62 }) {
    return compose(svg, { width: size, bg, logoColor, fraction });
}

// Tint an SVG and rasterize it to fit within w×h (transparent); return {buf,w,h}.
async function rasterize(svg, color, w, h) {
    const buf = await sharp(Buffer.from(tintLogo(svg, color)))
        .resize(w, h, { fit: "inside", background: TRANSPARENT })
        .png()
        .toBuffer();
    const m = await sharp(buf).metadata();
    return { buf, w: m.width, h: m.height };
}

/**
 * OG card: the brand lockup STACKED — the lotus mark above the "pollinations.ai"
 * logotype — centered on a solid field. Both are modular brand atoms (`logo.svg`
 * + `logo-text.svg`), so the card is just a composition; nothing is extracted at
 * render time. Stacking (vs. the wide horizontal lockup) keeps the whole mark
 * inside the central square, so it survives the 1:1 crops small link-preview
 * thumbnails apply.
 */
export async function renderOg(
    lotusSvg,
    textSvg,
    {
        width = 1200,
        height = 630,
        bg = null,
        logoColor,
        lotusSize = 230,
        textWidth = 470,
        gap = 34,
    },
) {
    const lotus = await rasterize(lotusSvg, logoColor, lotusSize, lotusSize);
    const text = await rasterize(textSvg, logoColor, textWidth, height);

    const stackH = lotus.h + gap + text.h;
    const top = Math.round((height - stackH) / 2);
    const cx = width / 2;
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: bg ? { ...hexToRgb(bg), alpha: 1 } : TRANSPARENT,
        },
    })
        .composite([
            { input: lotus.buf, left: Math.round(cx - lotus.w / 2), top },
            {
                input: text.buf,
                left: Math.round(cx - text.w / 2),
                top: top + lotus.h + gap,
            },
        ])
        .png()
        .toBuffer();
}
