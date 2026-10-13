const excluded = /\b(?:cached?|batch|promo(?:tional)?|trial|priority)\b/i;
const unitPattern =
    /(?:1\s*M|million|1,000,000)\s+tokens(?:\s+(?:USD|\(USD\)))?[.\s]*$/i;
const moneyPattern = /^(?:\$|USD\s+)(\d+(?:\.\d+)?)$/;
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Formatting alone may differ; checkpoint versions and suffixes stay intact.
export function exactModelIdentity(value, upstreamModel) {
    if (typeof value !== "string" || typeof upstreamModel !== "string")
        return false;
    const normalize = (name) =>
        name
            .replace(/^#{1,6}\s+/, "")
            .toLowerCase()
            .replace(/[\s-]+/g, "-");
    return [upstreamModel, upstreamModel.split("/").at(-1)].some(
        (name) => normalize(value) === normalize(name),
    );
}

// Recognize only explicit table columns and model-page embedding price blocks.
// Unknown layouts stay unknown instead of guessing from neighboring numbers.
export function extractPrices(text, { model, upstreamModel, category, quote }) {
    if (typeof text !== "string" || !upstreamModel) return null;
    const checkpoint = upstreamModel.split("/").at(-1);
    const exact = (value) => exactModelIdentity(value, upstreamModel);
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
        const ancestors = [];
        let currencies = [];
        for (let j = 0; j < index; j++) {
            const value = lines[j].value;
            const heading = value.match(/^(#{1,6})\s/);
            if (!heading) {
                if (!value.startsWith("|") && foreignCurrency(value))
                    currencies.push({ level: ancestors.at(-1)?.level ?? 0 });
                continue;
            }
            currencies = currencies.filter(
                ({ level }) => level > 0 && level < heading[1].length,
            );
            while (
                ancestors.length &&
                ancestors.at(-1).level >= heading[1].length
            )
                ancestors.pop();
            ancestors.push({ level: heading[1].length, value });
        }
        if (currencies.length) return false;
        if (
            ancestors.some(
                ({ value }) =>
                    foreignCurrency(value) ||
                    (!standard.test(value) &&
                        (excluded.test(value) || restriction.test(value))),
            )
        )
            return false;
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
        const descriptor = lines[i - 1];
        const ordered =
            descriptor &&
            /^Per-model pricing for headline models\. Fast variants appear as adjacent rows\. In each Standard or Priority cell, prices are input \/ cached input \/ output \(USD per 1M tokens\), in that order\.$/.test(
                descriptor.value,
            );
        // Unit must belong to this table, with only standard section labels in between.
        let unit = ordered ? descriptor : undefined;
        let unitIndex = ordered ? i - 1 : undefined;
        let restricted = false;
        for (let j = i - 1; !ordered && j >= 0; j--) {
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
            (!ordered && !scopeValid(i)) ||
            (!ordered && excluded.test(unit.value)) ||
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
            if (
                ordered &&
                !embedding &&
                headings.filter((heading) => heading === "Standard").length ===
                    1
            ) {
                const k = headings.indexOf("Standard");
                const rate = values[k].match(
                    /^(\$\d+(?:\.\d+)?) \/ \$\d+(?:\.\d+)? \/ (\$\d+(?:\.\d+)?)$/,
                );
                if (!rate) continue;
                const cellStart =
                    row.start +
                    row.value
                        .split("|")
                        .slice(0, k + 1)
                        .join("|").length +
                    1;
                const start = text.indexOf(values[k], cellStart);
                const fragments = [
                    evidence(
                        "unit",
                        "USD per 1M tokens",
                        descriptor.start +
                            descriptor.value.indexOf("USD per 1M tokens"),
                    ),
                    evidence(
                        "header",
                        "prices are input / cached input / output (USD per 1M tokens), in that order.",
                        descriptor.start +
                            descriptor.value.indexOf("prices are input"),
                    ),
                    evidence(
                        "header",
                        "Standard",
                        header.start + header.value.indexOf("Standard"),
                    ),
                    evidence(
                        "model",
                        values[0],
                        row.start + row.value.indexOf(values[0]),
                    ),
                    evidence("price", rate[1], start),
                    evidence(
                        "price",
                        rate[2],
                        start + values[k].lastIndexOf(rate[2]),
                    ),
                ];
                if (row.value.split(/\s+/).length <= 25)
                    fragments.push(evidence("row", row.value, row.start));
                const result = finish(
                    Number(rate[1].slice(1)),
                    Number(rate[2].slice(1)),
                    fragments,
                    row.start,
                    row.start + row.value.length,
                    ["standard"],
                );
                if (result) return result;
                continue;
            }
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
            paths.every(([, value]) => exactModelIdentity(value, checkpoint)) &&
            lines[i - 2]?.value.replace(/^#{1,6}\s+/, "") ===
                "Available Serverless" &&
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
