import {
    controls,
    demoBank,
    drawFrame,
    readBank,
    readPatch,
    textureIndex,
} from "./patch.js";

const $ = (id) => document.getElementById(id);
const canvas = $("stage");
const ctx = canvas.getContext("2d");
let bank = [],
    images = [],
    selected = 0,
    time = 0,
    last = 0,
    raf = 0;
let patch = readPatch();
let playing = false;

function render() {
    if (images.length) drawFrame(ctx, images, patch, time, selected);
}

function tick(now) {
    raf = 0;
    if (!playing || document.hidden) return;
    if (last) time += Math.min((now - last) / 1000, 0.05);
    last = now;
    render();
    raf = requestAnimationFrame(tick);
}

function syncPlayback() {
    cancelAnimationFrame(raf);
    last = 0;
    $("play").textContent = playing ? "Pause" : "Play";
    $("play").setAttribute("aria-pressed", String(playing));
    if (playing && !document.hidden) raf = requestAnimationFrame(tick);
}

function updateControls() {
    for (const name of Object.keys(controls)) {
        $(name).value = patch[name];
        $(`${name}-value`).value = patch[name];
    }
    render();
}

function selectTexture(index) {
    if (!images.length) return;
    selected = textureIndex(index, images.length);
    for (const [i, button] of [...$("bank").children].entries())
        button.setAttribute("aria-pressed", String(i === selected));
    $("caption").textContent =
        bank[selected].caption || `Texture ${selected + 1}`;
    render();
}

async function loadBank(input) {
    const next = readBank(input);
    if (next.reduce((bytes, item) => bytes + item.url.length, 0) > 32_000_000)
        throw Error("Bank is larger than 32 MB.");
    $("status").textContent = "Loading images…";
    const loaded = await Promise.all(
        next.map(async ({ url }) => {
            const image = new Image();
            image.crossOrigin = "anonymous";
            image.referrerPolicy = "no-referrer";
            image.src = url;
            try {
                await image.decode();
            } catch {
                throw Error(
                    "An image could not load. Use a public image URL with CORS enabled, or a local image.",
                );
            }
            if (image.width * image.height > 16_777_216)
                throw Error("Use images no larger than 16 megapixels.");
            return image;
        }),
    );
    const nextPatch = readPatch(input.patch);
    bank = next;
    images = loaded;
    patch = nextPatch;
    time = Number.isFinite(input.time)
        ? Math.max(0, Math.min(input.time, 86_400))
        : 0;
    $("bank").replaceChildren(
        ...bank.map((entry, i) => {
            const button = document.createElement("button");
            button.type = "button";
            const preview = loaded[i].cloneNode();
            preview.alt = "";
            const label = document.createElement("span");
            label.textContent = `${i + 1} ${entry.caption || "Texture"}`;
            button.append(preview, label);
            button.onclick = () => selectTexture(i);
            return button;
        }),
    );
    selectTexture(Number.isInteger(input.selected) ? input.selected : 0);
    updateControls();
    $("status").textContent =
        `${bank.length} textures ready. Playback runs locally.`;
}

for (const [name, [min, max, step]] of Object.entries(controls)) {
    Object.assign($(name), { min, max, step });
    $(name).oninput = () => {
        patch[name] = Number($(name).value);
        updateControls();
    };
}

function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function readImageFile(file) {
    if (!/^image\/(png|jpeg|webp|gif|svg\+xml)$/.test(file.type))
        throw Error("Choose image files, or one bank JSON file.");
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
            resolve({ url: reader.result, caption: file.name });
        reader.onerror = () => reject(Error("Could not read the image file."));
        reader.readAsDataURL(file);
    });
}

$("files").onchange = async (event) => {
    $("files").disabled = true;
    try {
        const files = [...event.target.files];
        if (!files.length) return;
        if (
            files.length > 16 ||
            files.reduce((bytes, file) => bytes + file.size, 0) > 32_000_000
        )
            throw Error("Choose up to 16 images, totaling at most 32 MB.");
        const input =
            files.length === 1 && /\.json$/i.test(files[0].name)
                ? JSON.parse(await files[0].text())
                : { images: await Promise.all(files.map(readImageFile)) };
        await loadBank(input);
    } catch (error) {
        $("status").textContent = error.message;
    } finally {
        $("files").disabled = false;
        $("files").value = "";
    }
};

$("play").onclick = () => {
    playing = !playing;
    syncPlayback();
};
$("export").onclick = () =>
    download(
        new Blob(
            [JSON.stringify({ images: bank, patch, selected, time }, null, 2)],
            { type: "application/json" },
        ),
        "texture-bank.json",
    );
$("frame").onclick = () =>
    canvas.toBlob((blob) => {
        if (blob) download(blob, "texture-frame.png");
    }, "image/png");
$("reset").onclick = () => {
    patch = readPatch();
    time = 0;
    updateControls();
};
canvas.onpointerdown = (event) => {
    canvas.setPointerCapture(event.pointerId);
    canvas.focus();
};
canvas.onpointermove = (event) => {
    if (!event.buttons) return;
    const bounds = canvas.getBoundingClientRect();
    patch = readPatch({
        ...patch,
        rotation: Math.round(
            ((event.clientX - bounds.left) / bounds.width - 0.5) * 360,
        ),
        blend: (event.clientY - bounds.top) / bounds.height,
    });
    updateControls();
};
document.addEventListener("keydown", (event) => {
    if (
        ["INPUT", "BUTTON", "A", "TEXTAREA", "SELECT"].includes(
            event.target.tagName,
        ) ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey
    )
        return;
    if (event.code === "Space") {
        event.preventDefault();
        $("play").click();
    } else if (/^[1-9]$/.test(event.key) && Number(event.key) <= images.length)
        selectTexture(Number(event.key) - 1);
    else if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
        event.preventDefault();
        selectTexture(selected + (event.key === "ArrowRight" ? 1 : -1));
    }
});
document.addEventListener("visibilitychange", syncPlayback);
new ResizeObserver(() => {
    const bounds = canvas.getBoundingClientRect();
    const scale = Math.min(devicePixelRatio || 1, 1.5, 1600 / bounds.width);
    canvas.width = Math.round(bounds.width * scale);
    canvas.height = Math.round(bounds.height * scale);
    render();
}).observe(canvas);
loadBank(demoBank).catch((error) => {
    $("status").textContent = error.message;
});
