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

/**
 * OG card: a tinted logo (typically the wide wordmark) fit within `wFraction` ×
 * `hFraction` of the card, centered on a solid brand-color field. Uses fit
 * "inside" + gravity center so any aspect ratio is preserved without cropping.
 */
export async function renderOg(
    svg,
    {
        width = 1200,
        height = 630,
        bg,
        logoColor,
        wFraction = 0.7,
        hFraction = 0.55,
    },
) {
    const logo = await sharp(Buffer.from(tintLogo(svg, logoColor)))
        .resize(Math.round(width * wFraction), Math.round(height * hFraction), {
            fit: "inside",
            background: TRANSPARENT,
        })
        .png()
        .toBuffer();
    return sharp({
        create: {
            width,
            height,
            channels: 4,
            background: { ...hexToRgb(bg), alpha: 1 },
        },
    })
        .composite([{ input: logo, gravity: "center" }])
        .png()
        .toBuffer();
}
