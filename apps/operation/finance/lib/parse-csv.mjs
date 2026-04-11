// Minimal RFC 4180 CSV parser: supports quoted fields, embedded commas, escaped quotes.
// Does NOT support embedded newlines inside quoted fields (our source never has them).

function parseLine(line) {
    const out = [];
    let i = 0;
    while (i <= line.length) {
        if (i === line.length) {
            // trailing comma produced an extra empty field — already pushed, just stop
            break;
        }
        if (line[i] === '"') {
            // quoted field
            let v = "";
            i++;
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') {
                    v += '"';
                    i += 2;
                } else if (line[i] === '"') {
                    i++;
                    break;
                } else {
                    v += line[i];
                    i++;
                }
            }
            out.push(v);
            if (line[i] === ",") i++;
        } else {
            // unquoted field
            let v = "";
            while (i < line.length && line[i] !== ",") {
                v += line[i];
                i++;
            }
            out.push(v);
            if (i < line.length && line[i] === ",") {
                i++;
                // if comma was the last char, push trailing empty field
                if (i === line.length) {
                    out.push("");
                    break;
                }
            } else {
                break;
            }
        }
    }
    return out;
}

export function parseCsv(text, { filename = "<input>" } = {}) {
    const lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (lines.length === 0) return [];
    const headers = parseLine(lines[0]).map((h) => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const fields = parseLine(lines[i]);
        if (fields.length !== headers.length) {
            throw new Error(
                `${filename}: line ${i + 1}: expected ${headers.length} fields, got ${fields.length}`,
            );
        }
        const row = {};
        for (let j = 0; j < headers.length; j++) {
            const key = headers[j];
            const val = fields[j];
            row[key] = key === "amount_eur" ? Number(val) : val;
        }
        rows.push(row);
    }
    return rows;
}
