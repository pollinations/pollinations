// Edit drawFrame to change the instrument. No compiler, framework, or API key.
export const controls = {
    rotation: [-180, 180, 1, 15],
    repetition: [1, 10, 1, 4],
    blend: [0, 1, 0.01, 0.45],
    speed: [-1, 1, 0.01, 0.12],
};

export function readPatch(input = {}) {
    return Object.fromEntries(
        Object.entries(controls).map(([name, [min, max, , fallback]]) => [
            name,
            Number.isFinite(input[name])
                ? Math.min(max, Math.max(min, input[name]))
                : fallback,
        ]),
    );
}

export function readBank(input) {
    if (
        !Array.isArray(input?.images) ||
        !input.images.length ||
        input.images.length > 16
    )
        throw Error("Use a bank with 1–16 images.");
    return input.images.map(({ url, caption = "" }) => {
        if (typeof url !== "string" || url.length > 12_000_000)
            throw Error("Each image needs a URL smaller than 12 MB.");
        const parsed = new URL(url);
        const dataImage = /^data:image\/(png|jpeg|webp|gif|svg\+xml)[;,]/i.test(
            url,
        );
        if (
            (!dataImage && !["http:", "https:"].includes(parsed.protocol)) ||
            parsed.username ||
            parsed.password
        )
            throw Error("Use public HTTP(S) image URLs or image data URLs.");
        if (
            [...parsed.searchParams.keys()].some((key) =>
                /^(key|api[_-]?key|token|access_token|authorization)$/i.test(
                    key,
                ),
            )
        )
            throw Error("Remove credentials from image URLs before sharing.");
        return { url, caption: String(caption) };
    });
}

export function textureIndex(index, length) {
    return ((index % length) + length) % length;
}

export function drawFrame(ctx, images, patch, time, selected) {
    const { width, height } = ctx.canvas;
    ctx.fillStyle = "#18293a";
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.translate(width / 2, height / 2);
    ctx.rotate((patch.rotation * Math.PI) / 180 + time * patch.speed);
    const size = Math.hypot(width, height) / patch.repetition;
    const reach = Math.ceil(patch.repetition / 2) + 1;
    for (let y = -reach; y < reach; y++) {
        for (let x = -reach; x < reach; x++) {
            ctx.save();
            ctx.translate(x * size, y * size);
            ctx.scale(x % 2 ? -1 : 1, y % 2 ? -1 : 1);
            ctx.drawImage(
                images[textureIndex(selected, images.length)],
                -size / 2,
                -size / 2,
                size,
                size,
            );
            ctx.globalCompositeOperation = "screen";
            ctx.globalAlpha = patch.blend;
            ctx.rotate(time * patch.speed * -2);
            ctx.drawImage(
                images[textureIndex(selected + 1, images.length)],
                -size / 2,
                -size / 2,
                size,
                size,
            );
            ctx.restore();
        }
    }
    ctx.restore();
}

// These authored SVG textures make the first run work offline without generation.
export const demoBank = {
    images: [
        [
            "Ribbon",
            '<rect width="400" height="400" fill="#183d55"/><path d="M-80 400Q250-200 450 300M-80 300Q250-300 450 200" fill="none" stroke="#f78a66" stroke-width="65"/><circle cx="300" cy="120" r="70" fill="#f4cd73"/>',
        ],
        [
            "Orbit",
            '<rect width="400" height="400" fill="#2c2749"/><g fill="none" stroke="#87bcd3" stroke-width="18"><circle cx="200" cy="200" r="55"/><circle cx="200" cy="200" r="115"/><circle cx="200" cy="200" r="175"/></g><path d="M0 220L400 140" stroke="#f4cd73" stroke-width="32"/>',
        ],
        [
            "Petal",
            '<rect width="400" height="400" fill="#5c314b"/><g fill="#ef927b"><ellipse cx="200" cy="200" rx="185" ry="55"/><ellipse cx="200" cy="200" rx="55" ry="185"/></g><circle cx="200" cy="200" r="45" fill="#a9c9bd"/>',
        ],
    ].map(([caption, art]) => ({
        caption,
        url: `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400">${art}</svg>`)}`,
    })),
};
