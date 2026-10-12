// Browsers report SVG as "image/svg+xml", but a drag-dropped or renamed file
// can arrive with an empty or wrong type, so the extension is the reliable
// signal. Only SVG is accepted because the icon is rendered inline as an image.
export function isSvgFile(file: File): boolean {
    return (
        file.type === "image/svg+xml" ||
        file.name.toLowerCase().endsWith(".svg")
    );
}
