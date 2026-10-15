export function activityCsv<T>(
    columns: readonly (keyof T & string)[],
    rows: T[],
): string {
    const escapeCell = (value: unknown): string => {
        let text = String(value ?? "");
        // Spreadsheet applications interpret formula prefixes even in quoted cells.
        if (typeof value === "string" && /^[\t\r\n]|^\s*[=+\-@]/.test(text))
            text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
    };
    return [
        columns.map(escapeCell).join(","),
        ...rows.map((row) =>
            columns.map((column) => escapeCell(row[column])).join(","),
        ),
    ].join("\r\n");
}

export function downloadActivityCsv<T>(
    name: string,
    columns: readonly (keyof T & string)[],
    rows: T[],
): void {
    saveBlob(
        new Blob([activityCsv(columns, rows)], {
            type: "text/csv;charset=utf-8",
        }),
        `pollinations-${name}.csv`,
    );
}

export function saveBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
