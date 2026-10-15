import {
    PhotonImage,
    padding_bottom,
    padding_left,
    padding_right,
    padding_top,
    Rgba,
    resize,
    SamplingFilter,
} from "@cf-wasm/photon";
import busySquare from "../assets/cards/busy-square.png";
import busyTall from "../assets/cards/busy-tall.png";
import busyWide from "../assets/cards/busy-wide.png";
import enterSquare from "../assets/cards/enter-square.png";
import enterTall from "../assets/cards/enter-tall.png";
import enterWide from "../assets/cards/enter-wide.png";
import errorSquare from "../assets/cards/error-square.png";
import errorTall from "../assets/cards/error-tall.png";
import errorWide from "../assets/cards/error-wide.png";
import limitSquare from "../assets/cards/limit-square.png";
import limitTall from "../assets/cards/limit-tall.png";
import limitWide from "../assets/cards/limit-wide.png";
import refusedSquare from "../assets/cards/refused-square.png";
import refusedTall from "../assets/cards/refused-tall.png";
import refusedWide from "../assets/cards/refused-wide.png";

// The image cards built by shared/screens/render.js: what a page's <img> gets
// in place of a broken image, at the size it asked for. origin.ts loads this
// module only then.

const CARDS = {
    limit: { square: limitSquare, wide: limitWide, tall: limitTall },
    busy: { square: busySquare, wide: busyWide, tall: busyTall },
    error: { square: errorSquare, wide: errorWide, tall: errorTall },
    enter: { square: enterSquare, wide: enterWide, tall: enterTall },
    refused: { square: refusedSquare, wide: refusedWide, tall: refusedTall },
};
const RATIOS = { square: 1, wide: 16 / 9, tall: 9 / 16 };

export type CardKind = keyof typeof CARDS;

/**
 * The card in the shape nearest width x height, fitted into that size; the
 * margin takes the card's own colour, so nothing is stretched.
 */
export function card(
    kind: CardKind,
    requestedWidth: number,
    requestedHeight: number,
) {
    // params.ts lets sizes of 0 and below through, and a card, made without
    // gen, would pad up to any size: keep each side within 1 to 2048
    const side = (value: number) =>
        Number.isInteger(value) && value > 0 ? Math.min(value, 2048) : 1024;
    const width = side(requestedWidth);
    const height = side(requestedHeight);
    const ratio = width / height;
    const shape = (Object.keys(RATIOS) as (keyof typeof RATIOS)[]).reduce(
        (best, next) =>
            Math.abs(Math.log(RATIOS[next] / ratio)) <
            Math.abs(Math.log(RATIOS[best] / ratio))
                ? next
                : best,
    );
    const decoded = PhotonImage.new_from_byteslice(
        new Uint8Array(CARDS[kind][shape]),
    );
    const scale = Math.min(
        width / decoded.get_width(),
        height / decoded.get_height(),
    );
    const fitWidth = Math.max(1, Math.round(decoded.get_width() * scale));
    const fitHeight = Math.max(1, Math.round(decoded.get_height() * scale));
    let image = resize(decoded, fitWidth, fitHeight, SamplingFilter.Lanczos3);
    decoded.free();
    const [r, g, b] = image.get_raw_pixels();
    const pads = [
        [padding_left, Math.floor((width - fitWidth) / 2)],
        [padding_right, Math.ceil((width - fitWidth) / 2)],
        [padding_top, Math.floor((height - fitHeight) / 2)],
        [padding_bottom, Math.ceil((height - fitHeight) / 2)],
    ] as const;
    for (const [pad, size] of pads) {
        if (size <= 0) continue;
        const padded = pad(image, size, new Rgba(r, g, b, 255));
        image.free();
        image = padded;
    }
    try {
        return image.get_bytes_jpeg(80);
    } finally {
        image.free();
    }
}
