// Reuse from any browser module: renderContactSheet(bank.images, { columns: 3 }).
export const MAX_IMAGES = 24;
export const MAX_BYTES = 16 * 1024 * 1024;

export function validateBank(bank) {
    if (
        !Array.isArray(bank?.images) ||
        !bank.images.length ||
        bank.images.length > MAX_IMAGES
    )
        throw new Error(`Choose between 1 and ${MAX_IMAGES} images.`);
    let size = 0;
    const images = bank.images.map((image, index) => {
        const name = `Image ${index + 1}`;
        if (
            typeof image?.url !== "string" ||
            (image.caption !== undefined && typeof image.caption !== "string")
        )
            throw new Error(`${name}: expected {url, caption?}.`);
        size += image.url.length + (image.caption?.length ?? 0);
        if (size > MAX_BYTES) throw new Error("Bank must be under 16 MB.");
        const url = new URL(image.url);
        const dataImage =
            /^data:image\/(png|jpeg|webp|gif|svg\+xml)(;[^,]*)?,/i.test(
                image.url,
            );
        const credential = [...url.searchParams.keys()].some((key) =>
            /^(key|api_key|apikey|token|access_token|authorization)$/i.test(
                key,
            ),
        );
        if (
            (!dataImage && !["http:", "https:"].includes(url.protocol)) ||
            url.username ||
            url.password ||
            credential
        )
            throw new Error(
                `${name}: use a public HTTP(S) image URL without credentials, or PNG/JPEG/WebP/GIF/SVG data.`,
            );
        return { url: image.url, caption: image.caption ?? "" };
    });
    return { images };
}

// Pure layout: fixed-size cells keep a 24-image canvas below 6 megapixels.
export function gridLayout(count, columns = 3) {
    if (
        !Number.isInteger(count) ||
        count < 1 ||
        count > MAX_IMAGES ||
        !Number.isInteger(columns) ||
        columns < 1 ||
        columns > 6
    )
        throw new Error("Use 1–24 images and 1–6 columns.");
    const gap = 16,
        cellWidth = 256,
        imageHeight = 192,
        captionHeight = 40;
    const usedColumns = Math.min(columns, count);
    return {
        width: gap + usedColumns * (cellWidth + gap),
        height:
            gap +
            Math.ceil(count / usedColumns) *
                (imageHeight + captionHeight + gap),
        cells: Array.from({ length: count }, (_, index) => ({
            x: gap + (index % usedColumns) * (cellWidth + gap),
            y:
                gap +
                Math.floor(index / usedColumns) *
                    (imageHeight + captionHeight + gap),
            width: cellWidth,
            height: imageHeight,
        })),
    };
}

// Browser effects stay here; a failed load never changes the caller's canvas.
export async function renderContactSheet(images, { columns = 3 } = {}) {
    const bank = validateBank({ images });
    const layout = gridLayout(bank.images.length, columns);
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const context = canvas.getContext("2d");
    context.fillStyle = "#f5f1e8";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.font = "14px sans-serif";
    for (const [index, entry] of bank.images.entries()) {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.referrerPolicy = "no-referrer";
        image.src = entry.url;
        try {
            await image.decode();
        } catch {
            throw new Error(
                `Image ${index + 1} could not load. Check its URL and CORS permission, or upload a saved copy.`,
            );
        }
        const cell = layout.cells[index];
        const scale = Math.min(
            cell.width / image.naturalWidth,
            cell.height / image.naturalHeight,
        );
        const width = image.naturalWidth * scale,
            height = image.naturalHeight * scale;
        context.fillStyle = "#e5dfd2";
        context.fillRect(cell.x, cell.y, cell.width, cell.height);
        context.drawImage(
            image,
            cell.x + (cell.width - width) / 2,
            cell.y + (cell.height - height) / 2,
            width,
            height,
        );
        context.fillStyle = "#282c29";
        let caption = `${index + 1}. ${entry.caption.slice(0, 200)}`.replace(
            /\s+/g,
            " ",
        );
        if (context.measureText(caption).width > cell.width) {
            while (context.measureText(`${caption}…`).width > cell.width)
                caption = caption.slice(0, -1);
            caption += "…";
        }
        context.fillText(caption, cell.x, cell.y + cell.height + 24);
        image.src = "";
    }
    return canvas;
}
