import sharp from "sharp";

const TRANSPARENT = { r: 0, g: 0, b: 0, alpha: 0 };

/** The @pollinations_ai/ui logo paints with fill:currentColor. */
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

/** Favicon: logo fills 100% of the canvas, transparent background. */
export function renderFavicon(svg, size, color) {
    return sharp(Buffer.from(tintLogo(svg, color)))
        .resize(size, size, { fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer();
}

/** PWA/Apple icon: logo at `fraction` size, centered, transparent background. */
export async function renderPaddedIcon(svg, size, color, fraction = 0.65) {
    const logoSize = Math.round(size * fraction);
    const offset = Math.floor((size - logoSize) / 2);
    const logo = await sharp(Buffer.from(tintLogo(svg, color)))
        .resize(logoSize, logoSize, { fit: "contain", background: TRANSPARENT })
        .png()
        .toBuffer();
    return sharp({
        create: {
            width: size,
            height: size,
            channels: 4,
            background: TRANSPARENT,
        },
    })
        .composite([{ input: logo, top: offset, left: offset }])
        .png()
        .toBuffer();
}

/** OG card: logo centered on a solid brand-color field. */
export async function renderOg(
    svg,
    { width = 1200, height = 630, bg, logoColor, fraction = 0.5 },
) {
    const logoSize = Math.round(height * fraction);
    const logo = await sharp(Buffer.from(tintLogo(svg, logoColor)))
        .resize(logoSize, logoSize, { fit: "contain", background: TRANSPARENT })
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
