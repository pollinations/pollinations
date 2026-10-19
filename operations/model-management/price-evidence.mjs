const excluded =
    /\b(?:cached?|batch|promo(?:tional)?|trial|priority|flex|fast|ultrafast|reserved|training|fine-tuning|customization)\b/i;
const unitPattern =
    /(?:1\s*M|million|1,000,000)\s+tokens(?:\s+(?:USD|\(USD\)))?[.\s]*$/i;
const moneyPattern =
    /^(?:\$\s*|USD\s+)(\d+(?:\.\d+)?)(?:\s*\/\s*(MTok|M tokens|1M tokens))?$/i;
const escaped = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const currencyCodes = new Set(Intl.supportedValuesOf("currency"));

export function modelIdentityNames(model, upstreamModel = model?.name) {
    const canonical = model?.name ?? upstreamModel;
    const slug = canonical
        ?.split("/")
        .at(-1)
        .toLowerCase()
        .replace(/[\s_]+/g, "-");
    const publisher = canonical?.includes("/")
        ? canonical.split("/")[0].replaceAll("-", "")
        : "";
    return [
        ...new Set(
            [
                canonical,
                canonical?.split("/").at(-1),
                upstreamModel,
                model?.title,
                ...(model?.aliases ?? []),
            ].filter((name) => {
                if (typeof name !== "string") return false;
                if (exactModelIdentity(name, canonical)) return true;
                const alias = name
                    .toLowerCase()
                    .replace(/^(v\d+(?:\.\d+)*)\s+(.+)$/, "$2 $1")
                    .replace(/[\s_]+/g, "-");
                if (!slug?.endsWith(`-${alias}`)) return false;
                const removed = slug.slice(0, -alias.length - 1);
                return (
                    /^[a-z]+$/.test(removed) && publisher.startsWith(removed)
                );
            }),
        ),
    ];
}

// Formatting alone may differ; checkpoint versions and suffixes stay intact.
export function exactModelIdentity(value, upstreamModel) {
    if (typeof value !== "string" || typeof upstreamModel !== "string")
        return false;
    const normalize = (name) =>
        name
            .replace(/^#{1,6}\s+/, "")
            .toLowerCase()
            .replace(/^(v\d+(?:\.\d+)*)\s+(.+)$/, "$2 $1")
            .replace(/\[([^\]]+)\]/g, "$1")
            .replace(/[\s_-]+/g, "-");
    return [upstreamModel, upstreamModel.split("/").at(-1)].some(
        (name) => normalize(value) === normalize(name),
    );
}

// Recognize only explicit table columns and model-page embedding price blocks.
// Unknown layouts stay unknown instead of guessing from neighboring numbers.
export function extractPrices(
    text,
    { model, upstreamModel, category, quote, sourceUrl },
) {
    if (typeof text !== "string" || !upstreamModel) return null;
    const checkpoint = upstreamModel.split("/").at(-1);
    const names = modelIdentityNames(model, upstreamModel);
    const exact = (value) =>
        names.some(
            (name) =>
                exactModelIdentity(value, name) ||
                exactModelIdentity(
                    value.replace(
                        /^(?:#{1,6}\s*)?(v\d+(?:\.\d+)*)\s+(.+)$/i,
                        "$2 $1",
                    ),
                    name,
                ),
        );
    const sourcePath =
        typeof sourceUrl === "string" && URL.canParse(sourceUrl)
            ? new URL(sourceUrl).pathname
            : "";
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
            ([code]) => code !== "USD" && currencyCodes.has(code),
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
            if (
                value === "Show discount options" ||
                value === "StandardPriorityFlex/Batch"
            )
                continue;
            if (value.startsWith("|")) continue;
            if (standard.test(value)) return true;
            if (value === "Image generation") break;
            const heading =
                /^#{1,6}\s/.test(value) ||
                /^(?:batch|promotional?|trial|priority|flex|fast|ultrafast|reserved)(?: pricing(?: data)?)?$/i.test(
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
        unit = "1M_tokens",
        variants,
    ) => {
        if (quote !== undefined) {
            if (!quote) return null;
            let start = text.indexOf(quote),
                matched = false;
            while (start >= 0) {
                if (
                    start < priceEnd &&
                    start + quote.length > priceStart &&
                    fragments.some(
                        (item) =>
                            item.kind === "price" &&
                            start < item.end &&
                            start + quote.length > item.start,
                    )
                ) {
                    matched = true;
                    break;
                }
                start = text.indexOf(quote, start + 1);
            }
            if (!matched) return null;
        }
        if (fragments.some((item) => item.quote.split(/\s+/).length > 25))
            return null;
        return {
            currency: "USD",
            unit,
            input,
            output,
            conditions,
            evidence: fragments,
            ...(variants ? { variants } : {}),
        };
    };
    const cells = (line) =>
        line
            .replace(/^\|/, "")
            .replace(/\|$/, "")
            .split("|")
            .map((cell) => cell.trim());
    const tokenHeading = (heading) =>
        heading
            .toLowerCase()
            .replace(/^price per 1m (input|output) tokens$/, "$1")
            .replace(
                /^(input|output) pric(?:e|ing) \(per (?:1m|1 million|million|1,000,000) tokens\)$/,
                "$1",
            )
            .replace(/^(?:base )?(input|output) tokens$/, "$1");

    // This public catalog contract quotes USD per token, not per million tokens.
    if (
        /^https:\/\/openrouter\.ai\/api\/v1\/model\/[^/?#]+\/[^/?#]+$/.test(
            sourceUrl ?? "",
        ) &&
        ["text", "embedding"].includes(kind)
    ) {
        let data;
        try {
            data = JSON.parse(text).data;
        } catch {
            return null;
        }
        if (!data || !exactModelIdentity(data.id, upstreamModel)) return null;
        const keys = embedding ? ["prompt"] : ["prompt", "completion"];
        const identityStart = text.indexOf(data.id);
        if (identityStart < 0) return null;
        const fragments = [evidence("model", data.id, identityStart)];
        const prices = [];
        for (const key of keys) {
            const value = data.pricing?.[key];
            if (
                typeof value !== "string" ||
                !/^(?:0|[1-9]\d*)(?:\.\d+)?(?:e[+-]?\d+)?$/i.test(value)
            )
                return null;
            const [coefficient, exponent = "0"] = value
                .toLowerCase()
                .split("e");
            const price = Number(`${coefficient}e${Number(exponent) + 6}`);
            if (!Number.isFinite(price) || price < 0) return null;
            const fragment = text.match(
                new RegExp(
                    `"${key}"\\s*:\\s*${escaped(JSON.stringify(value))}`,
                ),
            );
            if (!fragment) return null;
            fragments.push(evidence("price", fragment[0], fragment.index));
            prices.push(price);
        }
        const priceFragments = fragments.filter(
            (item) => item.kind === "price",
        );
        return finish(
            prices[0],
            prices[1] ?? null,
            fragments,
            Math.min(...priceFragments.map((item) => item.start)),
            Math.max(...priceFragments.map((item) => item.end)),
            [
                "OpenRouter catalog base token prices; routed provider, context tiers, non-token charges and purchase fees require verification",
            ],
        );
    }

    if (!["text", "embedding", "embeddings"].includes(kind)) {
        const variants = [];
        const add = (input, unit, conditions, fragments) => {
            if (fragments.some((item) => item.quote.split(/\s+/).length > 25))
                return;
            variants.push({
                input,
                output: null,
                unit,
                currency: "USD",
                conditions,
                evidence: fragments,
            });
        };
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (
                kind === "image" &&
                line.value === "Image generation" &&
                lines[i + 1]?.value === "Per image" &&
                lines[i + 2]?.value === "Quality"
            ) {
                const title = lines[0].value
                    .split("|")[0]
                    .trim()
                    .replace(/\s+(?:Model|API)(?:\s.*)?$/i, "");
                const pageOwner =
                    /\/models\/[^/]+\/?$/.test(sourcePath) &&
                    exact(sourcePath.split("/").filter(Boolean).at(-1))
                        ? lines
                              .slice(0, i)
                              .findLast((item) => exact(item.value))
                        : null;
                const owner =
                    lines
                        .slice(0, i)
                        .findLast((item) => /^#\s+[^#]/.test(item.value)) ??
                    (exact(title)
                        ? { value: title, start: lines[0].start }
                        : null) ??
                    pageOwner;
                if (!owner || !exact(owner.value) || !scopeValid(i + 1))
                    continue;
                const quality = lines[i + 3];
                if (!/^(?:Low|Medium|High)$/i.test(quality?.value ?? ""))
                    continue;
                for (let j = i + 4; j + 1 < lines.length; j += 2) {
                    const resolution = lines[j],
                        rate = lines[j + 1];
                    const money = rate.value.match(moneyPattern);
                    if (
                        !/^\d+\s*[x×]\s*\d+$/.test(resolution.value) ||
                        !money ||
                        money[2]
                    )
                        break;
                    add(
                        Number(money[1]),
                        "image",
                        [
                            `Quality: ${quality.value}`,
                            `Resolution: ${resolution.value}`,
                            "output component only; input charges remain unknown",
                        ],
                        [
                            evidence("model", owner.value, owner.start),
                            evidence(
                                "unit",
                                lines[i + 1].value,
                                lines[i + 1].start,
                            ),
                            evidence("condition", quality.value, quality.start),
                            evidence(
                                "condition",
                                resolution.value,
                                resolution.start,
                            ),
                            evidence("price", rate.value, rate.start),
                        ],
                    );
                }
            }
            if (
                kind === "audio" &&
                exact(line.value) &&
                lines[i + 1]?.value === "Text to Speech" &&
                /^Price per 1K characters$/i.test(lines[i + 3]?.value ?? "") &&
                scopeValid(i)
            ) {
                const rate = lines[i + 2],
                    money = rate.value.match(moneyPattern);
                if (money && !money[2])
                    add(
                        Number(money[1]),
                        "1K_characters",
                        ["Text to Speech; per-character billing"],
                        [
                            evidence("model", line.value, line.start),
                            evidence("price", rate.value, rate.start),
                            evidence(
                                "unit",
                                lines[i + 3].value,
                                lines[i + 3].start,
                            ),
                        ],
                    );
            }
            if (kind === "video") {
                const descriptor = line.value.split("|")[0].trim();
                const identity = descriptor.replace(
                    /\s+video\s+(?:with|without)\s+audio\s+price(?:\s*\(default\))?$/i,
                    "",
                );
                if (identity === descriptor || !exact(identity)) continue;
                const unit = lines
                    .slice(Math.max(0, i - 8), i)
                    .findLast((item) =>
                        /Paid Tier, per second in USD/i.test(item.value),
                    );
                if (!unit || !scopeValid(i)) continue;
                for (let j = i; j < lines.length; j++) {
                    const current = lines[j];
                    if (j > i && !/^\$\d/.test(current.value)) break;
                    const money = current.value.match(
                        /\$(\d+(?:\.\d+)?)\s*\(([^)]+)\)/,
                    );
                    if (!money) break;
                    const priceStart =
                        current.start + current.value.indexOf(money[0]);
                    add(
                        Number(money[1]),
                        "second",
                        [
                            descriptor,
                            `Resolution: ${money[2]}`,
                            "video output; other charges remain unknown",
                        ],
                        [
                            evidence(
                                "model",
                                identity,
                                line.start + line.value.indexOf(identity),
                            ),
                            evidence("unit", unit.value, unit.start),
                            evidence("price", money[0], priceStart),
                        ],
                    );
                }
            }
            if (kind === "image" && line.value.startsWith("|")) {
                const values = cells(line.value);
                if (!exact(values[0])) continue;
                const header = lines
                    .slice(Math.max(0, i - 4), i)
                    .findLast((item) =>
                        item.value.startsWith("| Model | Text-to-Image |"),
                    );
                const context = lines
                    .slice(Math.max(0, i - 6), i)
                    .findLast((item) =>
                        /pricing scales with output resolution.*megapixel/i.test(
                            item.value,
                        ),
                    );
                const rate = values[1]?.match(/^from\s+\$(\d+(?:\.\d+)?)$/i);
                if (!header || !context || !rate || !scopeValid(i)) continue;
                const nextSection = lines.findIndex(
                    (item, index) => index > i && /^#{1,6}\s/.test(item.value),
                );
                const details = lines
                    .slice(i + 1, nextSection < 0 ? undefined : nextSection)
                    .filter(
                        (item) =>
                            !item.value.startsWith("|") &&
                            /pricing explained:|resolution rounding:|(?:megapixel|MP).*\$/i.test(
                                item.value,
                            ),
                    );
                const conditions = [
                    "starting price; resolution dependent",
                    ...details.flatMap((item) =>
                        item.value.split(/(?<=\.)\s+/),
                    ),
                ];
                add(Number(rate[1]), "image", conditions, [
                    evidence(
                        "model",
                        values[0],
                        line.start + line.value.indexOf(values[0]),
                    ),
                    evidence("unit", context.value, context.start),
                    evidence(
                        "price",
                        values[1],
                        line.start + line.value.indexOf(values[1]),
                    ),
                ]);
            }
        }
        if (variants.length) {
            const first = variants[0];
            const fragments = [
                ...new Map(
                    variants
                        .flatMap((item) => item.evidence)
                        .map((item) => [
                            `${item.kind}:${item.start}:${item.end}`,
                            item,
                        ]),
                ).values(),
            ];
            const priced = fragments.filter((item) => item.kind === "price");
            const result = finish(
                first.input,
                null,
                fragments,
                Math.min(...priced.map((item) => item.start)),
                Math.max(...priced.map((item) => item.end)),
                first.conditions,
                first.unit,
                variants,
            );
            if (result) return result;
        }
    }
    for (let i = 0; i < lines.length - 2; i++) {
        const header = lines[i];
        if (!header.value.startsWith("|")) continue;
        const headings = cells(header.value);
        if (
            (kind === "video" || kind === "image") &&
            headings[0] === "Model" &&
            headings.includes("Output Resolution") &&
            headings.includes("Price (USD)")
        ) {
            const variants = [];
            let owner, feature, output;
            for (
                let j = i + 2;
                j < lines.length && lines[j].value.startsWith("|");
                j++
            ) {
                const row = lines[j],
                    values = cells(row.value);
                if (values[0]) {
                    if (owner && !exact(values[0])) break;
                    if (!exact(values[0])) continue;
                    owner = evidence(
                        "model",
                        values[0],
                        row.start + row.value.indexOf(values[0]),
                    );
                    feature = output = undefined;
                }
                if (!owner) continue;
                feature = values[headings.indexOf("Feature")] || feature;
                output = values[headings.indexOf("Output")] || output;
                const resolution =
                    values[headings.indexOf("Output Resolution")];
                const value = values[headings.indexOf("Price (USD)")];
                const rate = value?.match(
                    /^\$(\d+(?:\.\d+)?)\s*\/\s*(?:1\s+)?(second|image|count)$/i,
                );
                if (
                    !feature ||
                    !output ||
                    !resolution ||
                    !rate ||
                    !scopeValid(i)
                )
                    continue;
                const unit = rate[2].toLowerCase();
                variants.push({
                    input: Number(rate[1]),
                    output: null,
                    unit,
                    currency: "USD",
                    conditions: [
                        feature,
                        `Output: ${output}`,
                        `Resolution: ${resolution}`,
                        ...(unit === "count"
                            ? [
                                  "source meter: 1 count; duration mapping remains unverified",
                              ]
                            : []),
                    ],
                    evidence: [
                        owner,
                        evidence(
                            "unit",
                            value,
                            row.start + row.value.indexOf(value),
                        ),
                        evidence(
                            "price",
                            value,
                            row.start + row.value.indexOf(value),
                        ),
                    ],
                });
            }
            if (variants.length) {
                const fragments = variants.flatMap((item) => item.evidence);
                const priced = fragments.filter(
                    (item) => item.kind === "price",
                );
                const first = variants[0];
                const result = finish(
                    first.input,
                    null,
                    fragments,
                    Math.min(...priced.map((item) => item.start)),
                    Math.max(...priced.map((item) => item.end)),
                    first.conditions,
                    first.unit,
                    variants,
                );
                if (result) return result;
            }
        }
        if (
            kind === "text" &&
            headings[0] === "Model" &&
            headings[1] === "Type"
        ) {
            for (
                let j = i + 2;
                j < lines.length && lines[j].value.startsWith("|");
                j++
            ) {
                const row = lines[j],
                    values = cells(row.value);
                if (!exact(values[0])) continue;
                let input, output;
                for (
                    let k = j;
                    k < lines.length && lines[k].value.startsWith("|");
                    k++
                ) {
                    const value = cells(lines[k].value);
                    if (k > j && value[0]) break;
                    if (/^Input\b/.test(value[1]) && !/audio/i.test(value[1]))
                        input = { line: lines[k], values: value };
                    if (/^Text output\b/i.test(value[1]))
                        output = { line: lines[k], values: value };
                }
                if (!input || !output || !scopeValid(i)) continue;
                const variants = [];
                for (let k = 2; k < headings.length; k++) {
                    if (
                        !/1M tokens/i.test(headings[k]) ||
                        excluded.test(headings[k])
                    )
                        continue;
                    const a = input.values[k]?.match(moneyPattern),
                        b = output.values[k]?.match(moneyPattern);
                    if (!a || !b || a[2] || b[2]) continue;
                    variants.push({
                        input: Number(a[1]),
                        output: Number(b[1]),
                        unit: "1M_tokens",
                        currency: "USD",
                        conditions: [headings[k]],
                        evidence: [
                            evidence(
                                "model",
                                values[0],
                                row.start + row.value.indexOf(values[0]),
                            ),
                            evidence(
                                "unit",
                                headings[k],
                                header.start +
                                    header.value.indexOf(headings[k]),
                            ),
                            evidence(
                                "price",
                                input.values[k],
                                input.line.start +
                                    input.line.value.indexOf(input.values[k]),
                            ),
                            evidence(
                                "price",
                                output.values[k],
                                output.line.start +
                                    output.line.value.indexOf(output.values[k]),
                            ),
                        ],
                    });
                }
                if (variants.length) {
                    const fragments = variants.flatMap((item) => item.evidence);
                    const priced = fragments.filter(
                        (item) => item.kind === "price",
                    );
                    const first = variants[0];
                    const result = finish(
                        first.input,
                        first.output,
                        fragments,
                        Math.min(...priced.map((item) => item.start)),
                        Math.max(...priced.map((item) => item.end)),
                        first.conditions,
                        first.unit,
                        variants,
                    );
                    if (result) return result;
                }
            }
        }
        const modelColumn = headings.indexOf("API model string");
        const modelIndex = modelColumn < 0 ? 0 : modelColumn;
        if (
            modelColumn < 0 &&
            !/^(?:model(?: name| id)?|name|[\w ]+ models)$/i.test(headings[0])
        )
            continue;
        const separator = /^\|[\s:|-]+\|$/.test(lines[i + 1].value);
        const columnUnits = ["input", "output"].every((role) =>
            headings.some(
                (heading) =>
                    tokenHeading(heading) === role &&
                    /(?:1m|million|1,000,000)\s+(?:input |output )?tokens/i.test(
                        heading,
                    ),
            ),
        );
        const inlineUnits =
            ["input", "output"].every((role) =>
                headings.some((heading) => tokenHeading(heading) === role),
            ) &&
            cells(lines[i + (separator ? 2 : 1)].value).some(
                (value) => moneyPattern.exec(value)?.[2],
            );
        if (!separator && !columnUnits && !inlineUnits) continue;
        const descriptor = lines[i - 1];
        const ordered =
            descriptor &&
            /^Per-model pricing for headline models\. Fast variants appear as adjacent rows\. In each Standard or Priority cell, prices are input \/ cached input \/ output \(USD per 1M tokens\), in that order\.$/.test(
                descriptor.value,
            );
        // Unit must belong to this table, with only standard section labels in between.
        let unit = ordered
            ? descriptor
            : columnUnits || inlineUnits
              ? header
              : undefined;
        let unitIndex = ordered ? i - 1 : unit ? i : undefined;
        let restricted = false;
        for (let j = i - 1; !unit && j >= 0; j--) {
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
            (!ordered &&
                !inlineUnits &&
                !columnUnits &&
                excluded.test(unit.value)) ||
            restriction.test(unit.value) ||
            foreignCurrency(unit.value)
        )
            continue;
        for (
            let j = i + (separator ? 2 : 1);
            j < lines.length && lines[j].value.startsWith("|");
            j++
        ) {
            const row = lines[j];
            const values = cells(row.value);
            if (!exact(values[modelIndex]) || values.length !== headings.length)
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
                const heading = tokenHeading(headings[k]);
                if (
                    !/^(?:(?:short|long) context )?(?:input|output)(?: price)?$/.test(
                        heading,
                    )
                )
                    continue;
                const candidate = {
                    k,
                    value: Number(match[1]),
                    unit: match[2],
                    group: heading.replace(/(?:input|output)(?: price)?$/, ""),
                };
                (/\binput\b/.test(heading) ? input : output).push(candidate);
            }
            if (
                input.length !== 1 ||
                (inlineUnits &&
                    [...input, ...output].some(
                        (candidate) => !candidate.unit,
                    )) ||
                (embedding
                    ? output.length !== 0 ||
                      headings.some((heading) => /\boutput\b/i.test(heading))
                    : output.length !== 1 || input[0].group !== output[0].group)
            )
                continue;
            const fragments = [
                ...(!inlineUnits
                    ? [
                          columnUnits
                              ? evidence(
                                    "unit",
                                    header.value.match(
                                        /(?:1M|1 million|million|1,000,000) (?:input |output )?tokens/i,
                                    )[0],
                                    header.start +
                                        header.value.search(
                                            /(?:1M|1 million|million|1,000,000) (?:input |output )?tokens/i,
                                        ),
                                )
                              : evidence("unit", unit.value, unit.start),
                      ]
                    : []),
                evidence(
                    "model",
                    values[modelIndex],
                    row.start + row.value.indexOf(values[modelIndex]),
                ),
            ];
            if (modelColumn >= 0) {
                fragments.push(
                    evidence(
                        "header",
                        headings[modelIndex],
                        header.start +
                            header.value.indexOf(headings[modelIndex]),
                    ),
                );
            }
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
                if (inlineUnits) {
                    fragments.push(
                        evidence(
                            "unit",
                            selected.unit,
                            row.start +
                                row.value.indexOf(values[k], rowStart) +
                                values[k].lastIndexOf(selected.unit),
                        ),
                    );
                }
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
            for (const label of [
                "Deployment scope",
                "Input tokens per request",
            ]) {
                const k = headings.indexOf(label);
                if (k < 0) continue;
                conditions.push(`${label}: ${values[k]}`);
                fragments.push(
                    evidence(
                        "condition",
                        values[k],
                        row.start + row.value.indexOf(values[k]),
                    ),
                );
            }
            if (headings.includes("Input tokens per request")) {
                const scope = lines
                    .slice(0, i)
                    .findLast((line) => /^#{1,6}\s/.test(line.value));
                if (scope) {
                    conditions.push(scope.value);
                    fragments.push(
                        evidence("condition", scope.value, scope.start),
                    );
                }
            }
            if (/^Regions?: /i.test(descriptor?.value ?? "")) {
                conditions.push(descriptor.value);
                if (descriptor.value.split(/\s+/).length > 25) continue;
                fragments.push(
                    evidence("condition", descriptor.value, descriptor.start),
                );
            }
            const quantization = headings.indexOf("Quantization");
            if (quantization >= 0 && values[quantization] !== "-") {
                conditions.push(`Quantization: ${values[quantization]}`);
                fragments.push(
                    evidence(
                        "condition",
                        values[quantization],
                        row.start + row.value.indexOf(values[quantization]),
                    ),
                );
            }
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
    if (!embedding && kind !== "text") {
        const labels = lines.flatMap((line, index) =>
            line.value === "Model name" ? [index] : [],
        );
        const modelLine = labels.length === 1 ? lines[labels[0] + 1] : null;
        const pricingStart = lines.findIndex((line) =>
            /^#{1,6}\s+Pricing$/i.test(line.value),
        );
        if (!modelLine || !exact(modelLine.value) || pricingStart < 0)
            return null;
        for (let i = pricingStart + 1; i < lines.length; i++) {
            if (/^#{1,6}\s/.test(lines[i].value)) break;
            if (lines[i - 1]?.value !== "Output") continue;
            const match = lines[i].value.match(
                /^(?:\$|USD\s+)(\d+(?:\.\d+)?)\s*(?:per\s+|\/\s*)(image|second|minute|request)$/i,
            );
            if (!match || !scopeValid(i)) continue;
            const fragments = [
                evidence("model", modelLine.value, modelLine.start),
                evidence("header", lines[i - 1].value, lines[i - 1].start),
                evidence("price", lines[i].value, lines[i].start),
            ];
            const result = finish(
                Number(match[1]),
                null,
                fragments,
                lines[i].start,
                lines[i].start + lines[i].value.length,
                [
                    "output component only; full input and regional charges remain unknown",
                ],
            );
            if (result) return { ...result, unit: match[2].toLowerCase() };
        }
        return null;
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
