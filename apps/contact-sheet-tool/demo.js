import {
    MAX_BYTES,
    MAX_IMAGES,
    renderContactSheet,
    validateBank,
} from "./contact-sheet.js";

const form = document.querySelector("form");
const status = document.querySelector("#status");
const editor = document.querySelector("#bank");
const preview = document.querySelector("#preview");
const pngButton = document.querySelector("#png");
let downloadUrl;

function offerDownload(blob, name) {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = downloadUrl;
    link.download = name;
    link.click();
}
window.addEventListener("pagehide", () => {
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
});

async function run(task) {
    const controls = [...document.querySelectorAll("button, input, textarea")];
    for (const control of controls) control.disabled = true;
    status.textContent = "Working…";
    try {
        await task();
    } catch (error) {
        status.textContent = error.message;
    } finally {
        for (const control of controls) control.disabled = false;
        pngButton.disabled = !preview.firstElementChild;
    }
}

async function show(bank) {
    const canvas = await renderContactSheet(bank.images, {
        columns: Number(form.elements.columns.value),
    });
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
        "aria-label",
        bank.images
            .map((image, i) => `${i + 1}. ${image.caption || "Image"}`)
            .join("; "),
    );
    if (downloadUrl) URL.revokeObjectURL(downloadUrl);
    downloadUrl = undefined;
    preview.replaceChildren(canvas);
    editor.value = JSON.stringify(bank, null, 2);
    status.textContent = `${bank.images.length} images · ${canvas.width} × ${canvas.height} px · ready to download`;
}

form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(() => show(validateBank(JSON.parse(editor.value))));
});
document.querySelector("#export").addEventListener("click", () =>
    run(async () => {
        const bank = validateBank(JSON.parse(editor.value));
        offerDownload(
            new Blob([JSON.stringify(bank, null, 2)], {
                type: "application/json",
            }),
            "image-bank.json",
        );
        status.textContent =
            "Bank downloaded. Local uploads are embedded; public URLs stay as links.";
    }),
);
pngButton.addEventListener("click", () =>
    run(async () => {
        const blob = await new Promise((resolve) =>
            preview.firstElementChild.toBlob(resolve, "image/png"),
        );
        if (!blob) throw new Error("PNG export failed. Try fewer images.");
        offerDownload(blob, "contact-sheet.png");
        status.textContent = "PNG downloaded.";
    }),
);
document.querySelector("#import").addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;
    run(async () => {
        if (file.size > MAX_BYTES)
            throw new Error("Bank file must be under 16 MB.");
        await show(validateBank(JSON.parse(await file.text())));
    });
    event.target.value = "";
});
document.querySelector("#files").addEventListener("change", (event) => {
    const files = [...event.target.files];
    if (!files.length) return;
    run(async () => {
        if (
            files.length > MAX_IMAGES ||
            files.reduce((sum, file) => sum + file.size, 0) > 12 * 1024 * 1024
        )
            throw new Error(
                "Choose up to 24 images, under 12 MB total (16 MB as bank data).",
            );
        const images = [];
        for (const file of files) {
            if (
                ![
                    "image/png",
                    "image/jpeg",
                    "image/webp",
                    "image/gif",
                    "image/svg+xml",
                ].includes(file.type)
            )
                throw new Error(
                    "Uploads must be PNG, JPEG, WebP, GIF, or SVG.",
                );
            const url = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = () =>
                    reject(new Error(`Could not read ${file.name}.`));
                reader.readAsDataURL(file);
            });
            images.push({ url, caption: file.name });
        }
        await show(validateBank({ images }));
    });
    event.target.value = "";
});

// These four SVGs are our own fixture, rasterized before entering the image bank.
run(async () => {
    const images = [];
    for (const [index, color] of [
        "#f16b4b",
        "#dcb338",
        "#74a48d",
        "#6f8dc4",
    ].entries()) {
        const image = new Image();
        image.src = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="640" height="480" fill="${color}"/><circle cx="${180 + index * 60}" cy="180" r="115" fill="#f8f0d8"/><path d="M0 480L210 260L400 430L530 290L640 480" fill="#253e35"/><circle cx="${180 + index * 60}" cy="180" r="55" fill="${color}"/></svg>`)}`;
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        canvas.getContext("2d").drawImage(image, 0, 0);
        images.push({
            url: canvas.toDataURL("image/png"),
            caption: [
                "A small beginning",
                "Change one thing",
                "Keep the interesting bits",
                "Share your variation",
            ][index],
        });
    }
    await show({ images });
});
