const excluded = /\b(?:cached?|batch|promo(?:tional)?|trial|priority)\b/i;
const unitPattern = /(?:1\s*M|million|1,000,000)\s+tokens\b/i;
const moneyPattern = /^(?:\$|USD\s+)(\d+(?:\.\d+)?)$/;
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Recognize only explicit table columns and model-page embedding price blocks.
// Unknown layouts stay unknown instead of guessing from neighboring numbers.
export function extractPrices(text, { model, upstreamModel, category, quote }) {
    if (typeof text !== "string" || !upstreamModel) return null;
    const checkpoint = upstreamModel.split("/").at(-1);
    const names = [upstreamModel, checkpoint];
    const exact = (value) => names.some((item) => value === item);
    const kind = category ?? model?.category;
    const embedding = kind === "embedding" || kind === "embeddings";
    const lines = [];
    let offset = 0;
    for (const raw of text.split("\n")) {
        const value = raw.trim();
        lines.push({ value, start: offset + raw.indexOf(value) });
        offset += raw.length + 1;
    }
    const foreignCurrency = (value) =>
        [...value.matchAll(/\b[A-Z]{3}\b/g)].some(
            ([code]) =>
                code !== "USD" &&
                Intl.supportedValuesOf("currency").includes(code),
        );
    const standard = /^(?:#{1,6}\s*)?standard(?: pricing(?: data)?)?$/i;
    const restriction =
        /\b(?:only|until|below|above|under|over|discount(?:ed)?|limited|up to)\b|[<>≤≥]\s*\d/i;
    const scopeValid = (index) => {
        for (let j = index - 1; j >= 0; j--) {
            const value = lines[j].value;
            if (!value) continue;
            if (value.startsWith("|")) continue;
            if (standard.test(value)) return true;
            const heading =
                /^#{1,6}\s/.test(value) ||
                /^(?:batch|promotional?|trial|priority)(?: pricing(?: data)?)?$/i.test(
                    value,
                );
            if (index - j > 16 && !heading) continue;
            if (foreignCurrency(value)) return false;
            if (value === "Run queries immediately, pay only for usage")
                continue;
            if (excluded.test(value) || restriction.test(value)) return false;
            if (heading) break;
        }
        return true;
    };
    const evidence = (kind, value, start) => ({
        kind,
        quote: value,
        start,
        end: start + value.length,
    });
    const finish = (
        input,
        output,
        fragments,
        priceStart,
        priceEnd,
        conditions = [],
    ) => {
        if (quote !== undefined) {
            const start = text.indexOf(quote);
            if (
                !quote ||
                start < 0 ||
                start >= priceEnd ||
                start + quote.length <= priceStart
            )
                return null;
            if (
                !fragments.some(
                    (item) =>
                        item.kind === "price" &&
                        start < item.end &&
                        start + quote.length > item.start,
                )
            )
                return null;
        }
        if (fragments.some((item) => item.quote.split(/\s+/).length > 25))
            return null;
        return {
            currency: "USD",
            unit: "1M_tokens",
            input,
            output,
            conditions,
            evidence: fragments,
        };
    };
    const cells = (line) =>
        line
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
    for (let i = 0; i < lines.length - 2; i++) {
        const header = lines[i];
        if (
            !header.value.startsWith("|") ||
            !/^\|[\s:|-]+\|$/.test(lines[i + 1].value)
        )
            continue;
        const headings = cells(header.value);
        if (!/^(?:model|model name)$/i.test(headings[0])) continue;
        // Unit must belong to this table, with only standard section labels in between.
        let unit;
        let unitIndex;
        let restricted = false;
        for (let j = i - 1; j >= 0; j--) {
            const line = lines[j];
            if (!line.value) continue;
            if (unitPattern.test(line.value)) {
                unit = line;
                unitIndex = j;
                break;
            }
            if (excluded.test(line.value)) restricted = true;
            if (!standard.test(line.value)) break;
        }
        if (
            !unit ||
            restricted ||
            !scopeValid(unitIndex) ||
            !scopeValid(i) ||
            excluded.test(unit.value) ||
            restriction.test(unit.value) ||
            foreignCurrency(unit.value)
        )
            continue;
        for (
            let j = i + 2;
            j < lines.length && lines[j].value.startsWith("|");
            j++
        ) {
            const row = lines[j];
            const values = cells(row.value);
            if (!exact(values[0]) || values.length !== headings.length)
                continue;
            const input = [],
                output = [];
            for (let k = 1; k < headings.length; k++) {
                if (excluded.test(headings[k])) continue;
                const match = values[k].match(moneyPattern);
                if (!match) continue;
                const heading = headings[k].toLowerCase();
                if (
                    !/^(?:(?:short|long) context )?(?:input|output)(?: price)?$/.test(
                        heading,
                    )
                )
                    continue;
                const candidate = {
                    k,
                    value: Number(match[1]),
                    group: heading.replace(/(?:input|output)(?: price)?$/, ""),
                };
                (/\binput\b/.test(heading) ? input : output).push(candidate);
            }
            if (
                input.length !== 1 ||
                (embedding
                    ? output.length !== 0 ||
                      headings.some((heading) => /\boutput\b/i.test(heading))
                    : output.length !== 1 || input[0].group !== output[0].group)
            )
                continue;
            const fragments = [
                evidence("unit", unit.value, unit.start),
                evidence(
                    "model",
                    values[0],
                    row.start + row.value.indexOf(values[0]),
                ),
            ];
            if (row.value.split(/\s+/).length <= 25)
                fragments.push(evidence("row", row.value, row.start));
            for (const selected of [...input, ...output]) {
                const k = selected.k;
                const headerStart =
                    header.value
                        .split("|")
                        .slice(0, k + 1)
                        .join("|").length + 1;
                const rowStart =
                    row.value
                        .split("|")
                        .slice(0, k + 1)
                        .join("|").length + 1;
                fragments.push(
                    evidence(
                        "header",
                        headings[k],
                        header.start +
                            header.value.indexOf(headings[k], headerStart),
                    ),
                );
                fragments.push(
                    evidence(
                        "price",
                        values[k],
                        row.start + row.value.indexOf(values[k], rowStart),
                    ),
                );
            }
            const conditions = input[0].group.trim()
                ? [input[0].group.trim()]
                : [];
            const result = finish(
                input[0].value,
                output[0]?.value ?? null,
                fragments,
                row.start,
                row.start + row.value.length,
                conditions,
            );
            if (result) return result;
        }
    }
    if (!embedding) return null;
    const display = checkpoint.replaceAll("-", " ");
    const title = lines[0];
    const titleBound = new RegExp(
        `^(?:${escaped(checkpoint)}|${escaped(display)}) API(?:\\s|$)`,
        "i",
    ).test(title?.value ?? "");
    for (let i = 0; i < lines.length; i++) {
        const current = lines[i];
        const pattern =
            /^(?:\$|USD\s+)(\d+(?:\.\d+)?)\s*(?:\/|per)\s*(?:1\s*M|million|1,000,000)\s+tokens$/i;
        const inline = current.value.match(pattern);
        const combined = `${current.value} ${lines[i + 1]?.value ?? ""}`;
        const rate = inline ?? combined.match(pattern);
        if (!rate) continue;
        const previous = lines[i - 1];
        const direct = previous && exact(previous.value) && scopeValid(i - 1);
        const paths = [
            ...text
                .slice(0, current.start)
                .matchAll(/model path:accounts\/[^/\s]+\/models\/([\w.-]+)/g),
        ];
        const serverless =
            titleBound &&
            scopeValid(i - 2) &&
            paths.length > 0 &&
            paths.every(
                ([, value]) => value.toLowerCase() === checkpoint.toLowerCase(),
            ) &&
            lines[i - 2]?.value === "Available Serverless" &&
            previous?.value === "Run queries immediately, pay only for usage";
        if (!direct && !serverless) continue;
        const modelLine = direct ? previous : title;
        const block = inline
            ? current.value
            : text.slice(
                  current.start,
                  lines[i + 1].start + lines[i + 1].value.length,
              );
        const fragments = [
            evidence("model", modelLine.value, modelLine.start),
            evidence("price", block, current.start),
        ];
        if (serverless)
            fragments.push(
                evidence("model", paths[0][0], paths[0].index),
                evidence("header", lines[i - 2].value, lines[i - 2].start),
            );
        const result = finish(
            Number(rate[1]),
            null,
            fragments,
            current.start,
            current.start + block.length,
        );
        if (result) return result;
    }
    return null;
}
