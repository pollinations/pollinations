/** Read track durations from a complete, non-fragmented provider MP4. */
export function mp4TrackDurations(bytes: Uint8Array): {
    video: number;
    audio: number;
} {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const text = (offset: number) =>
        String.fromCharCode(...bytes.subarray(offset, offset + 4));
    const invalid = () =>
        new Error(
            "Provider returned an invalid MP4 with no usable video and audio tracks",
        );
    function boxes(
        start: number,
        end: number,
    ): { type: string; start: number; end: number }[] {
        const result = [];
        while (start < end) {
            if (start + 8 > end) throw invalid();
            let size = view.getUint32(start);
            let header = 8;
            if (size === 1) {
                if (start + 16 > end) throw invalid();
                size = Number(view.getBigUint64(start + 8));
                header = 16;
            } else if (size === 0) size = end - start;
            if (
                !Number.isSafeInteger(size) ||
                size < header ||
                start + size > end
            )
                throw invalid();
            result.push({
                type: text(start + 4),
                start: start + header,
                end: start + size,
            });
            start += size;
        }
        return result;
    }
    const root = boxes(0, bytes.length);
    const moov = root.find((box) => box.type === "moov");
    if (!root.some((box) => box.type === "ftyp") || !moov) throw invalid();
    const durations = { video: 0, audio: 0 };
    for (const trak of boxes(moov.start, moov.end).filter(
        (box) => box.type === "trak",
    )) {
        const mdia = boxes(trak.start, trak.end).find(
            (box) => box.type === "mdia",
        );
        if (!mdia) continue;
        const children = boxes(mdia.start, mdia.end);
        const hdlr = children.find((box) => box.type === "hdlr");
        const mdhd = children.find((box) => box.type === "mdhd");
        if (!hdlr || hdlr.end - hdlr.start < 12 || !mdhd) continue;
        const type = text(hdlr.start + 8);
        if (type !== "vide" && type !== "soun") continue;
        const version = bytes[mdhd.start];
        if (version > 1 || mdhd.end - mdhd.start < (version === 1 ? 32 : 20))
            throw invalid();
        const offset = mdhd.start + (version === 1 ? 20 : 12);
        const scale = view.getUint32(offset);
        const ticks =
            version === 1
                ? Number(view.getBigUint64(offset + 4))
                : view.getUint32(offset + 4);
        const duration = ticks / scale;
        if (!Number.isFinite(duration) || duration <= 0) throw invalid();
        durations[type === "vide" ? "video" : "audio"] = duration;
    }
    if (!durations.video || !durations.audio) throw invalid();
    return durations;
}
