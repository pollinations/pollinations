"""Wednesday Discord cards, rendered from catalog facts without a prose model call."""

import re
from collections import defaultdict
from datetime import UTC, datetime
from decimal import Decimal

import requests

from common import diff_models

CATEGORIES = {
    "text": "🧠 Text", "decision": "🧭 Decision", "image": "🎨 Image",
    "video": "🎬 Video", "audio": "🔊 Audio", "embeddings": "🔢 Embeddings",
    "3d": "🧊 3D", "realtime": "🎙️ Realtime",
}
LIST_FIELDS = {
    "input_modalities": "input", "output_modalities": "output",
    # Endpoint listings describe API discovery, not a model capability change.
    "supported_parameters": "parameters",
    "video_capabilities": "video features", "voices": "voices", "resolutions": "resolutions",
}
VALUE_FIELDS = {
    "context_length": "Context", "max_reference_images": "Reference images",
    "min_duration": "Minimum duration (s)", "max_duration": "Maximum duration (s)",
    "default_duration": "Default duration (s)", "per_user_rpm": "Requests/min",
    "category": "Category", "base_model": "Base model", "agent": "Agent",
}
PRICE_LABELS = {
    "promptTextTokens": "Text input", "completionTextTokens": "Text output",
    "promptCachedTokens": "Cached input", "promptImageTokens": "Image input",
    "promptCacheWriteTokens": "Cache writes", "completionReasoningTokens": "Reasoning",
    "completionImageTokens": "Image output", "promptAudioTokens": "Audio input",
    "completionAudioTokens": "Audio output", "promptAudioSeconds": "Audio input",
    "completionAudioSeconds": "Audio output", "completionVideoSeconds": "Video output",
    "completionEmbeddingTokens": "Embedding output",
}


def plain(value):
    """Catalog titles are display data, never Markdown, links or mentions."""
    text = " ".join(str(value).split())
    text = text.replace("@", "＠").replace("<", "‹").replace(">", "›")
    text = text.replace("://", ":\u200b//")
    return re.sub(r"([\\`*_~|\[\]()#])", r"\\\1", text)


def title(model):
    return plain((model.get("title") or model["name"].rsplit("/", 1)[-1])[:120])


def publisher(model):
    # The ID's owner is authoritative; the freely editable publisher label isn't.
    return model["name"].split("/")[1]


def access(model):
    return "💳 Paid" if model.get("paid_only") else "🌱 Quest"


def capabilities(model):
    values = set(model.get("capabilities") or [])
    if model.get("tools"):
        values.add("tool_calling")
    if model.get("reasoning"):
        values.add("reasoning")
    return values


def label(value):
    return plain(str(value).replace("_", " "))


def price_changes(before, after):
    old, new = before.get("pricing") or {}, after.get("pricing") or {}
    if any(before.get(key) != after.get(key) for key in ("flat_rate", "pricing_units")) or old.get("currency") != new.get("currency"):
        return ["🔵 Pricing basis changed; see model details"]
    changes = []
    price_keys = (old.keys() | new.keys()) - {"currency"}
    deltas = {}
    for key in sorted(price_keys):
        if key == "currency" or old.get(key) == new.get(key):
            continue
        name = PRICE_LABELS.get(key, label(key))
        if key not in old or key not in new:
            changes.append(f"🔵 {name} price {'added' if key in new else 'removed'}")
            continue
        a, b = Decimal(str(old[key])), Decimal(str(new[key]))
        if a == b:
            continue
        if a == 0:
            changes.append(f"🔴 {name} now charged")
        else:
            percent = abs((b - a) / a * 100)
            amount = f"{percent:.1f}".rstrip("0").rstrip(".") if percent >= Decimal("0.1") else "<0.1"
            deltas[key] = (b < a, amount)
            changes.append(f"{'🟢' if b < a else '🔴'} {name} {amount}% {'cheaper' if b < a else 'more expensive'}")
    if deltas.keys() == price_keys and len(set(deltas.values())) == 1:
        # Say "25% cheaper" only when every price component fell by the same amount.
        cheaper, amount = next(iter(deltas.values()))
        changes = [f"{'🟢' if cheaper else '🔴'} {amount}% {'cheaper' if cheaper else 'more expensive'}"]
    return changes


def updates(before, after):
    changes = price_changes(before, after)
    old_variants = {v["name"]: v for v in before.get("pricing_variants") or []}
    new_variants = {v["name"]: v for v in after.get("pricing_variants") or []}
    variant_changes = []
    options = []
    for name in sorted(old_variants.keys() | new_variants.keys()):
        if name not in old_variants or name not in new_variants:
            options.append(f"🔵 {plain(name)} pricing option {'added' if name in new_variants else 'removed'}")
        else:
            variant_changes.append((name, price_changes(old_variants[name], new_variants[name])))
    # The same price change at every resolution/context tier needs saying only once.
    uniform = (old_variants.keys() == new_variants.keys() and bool(changes)
               and all(items == changes for _, items in variant_changes))
    if not uniform:
        if old_variants or new_variants:
            changes = [f"{item[0]} Base: {item[2:]}" for item in changes]
        for name, items in variant_changes:
            changes.extend(f"{item[0]} {label(name)}: {item[2:]}" for item in items)
    changes.extend(options)
    for field in ("pricing_adjustments", "pricing_dimensions", "pricing_default_label"):
        if before.get(field) != after.get(field):
            changes.append(f"🔵 {label(field).capitalize()} changed; see model details")
    lists = {**LIST_FIELDS, "capabilities": "features"}
    for field, heading in lists.items():
        a = capabilities(before) if field == "capabilities" else set(before.get(field) or [])
        b = capabilities(after) if field == "capabilities" else set(after.get(field) or [])
        for values, verb in ((b - a, "added"), (a - b, "removed")):
            if values:
                display = plain if field.startswith("supported_") else label
                changes.append(f"🔵 {heading[0].upper() + heading[1:]} {verb}: {', '.join(display(v) for v in sorted(values))}")
    for field, heading in VALUE_FIELDS.items():
        a, b = before.get(field), after.get(field)
        if a != b:
            changes.append(f"🔵 {heading}: {plain(a) if a is not None else 'unspecified'} → {plain(b) if b is not None else 'unspecified'}")
    if before["name"] != after["name"]:
        changes.append(f"🔵 Replaces {title(before)}; old ID remains an alias")
    if bool(before.get("paid_only")) != bool(after.get("paid_only")):
        changes.append(f"🔵 Now {access(after)}")
    return changes


def weekly_diff(previous, current):
    diff = diff_models(previous, current).to_json()
    # As in news_index: an old ID retained as an alias is not a retired model.
    current_models = [m for models in (current or {}).values() for m in models]
    aliases = {a for m in current_models for a in m.get("aliases", [])}
    removed = {m["name"]: m for models in diff["removed"].values() for m in models}
    for category, models in diff["added"].items():
        for model in list(models):
            old = next((removed[a] for a in model.get("aliases", []) if a in removed), None)
            if old:
                models.remove(model)
                diff["changed"][category].append({"before": old, "after": model})
    for category, models in diff["removed"].items():
        diff["removed"][category] = [m for m in models if m["name"] not in aliases]
    return diff


def publisher_success(date):
    """Optional public 7-day rollups. Historical previews must not claim today's rates."""
    if date != datetime.now(UTC).date().isoformat():
        return None
    try:
        response = requests.get("https://gen.pollinations.ai/models/status",
                                params={"minutes": 10080, "traffic": "regular"}, timeout=30)
        response.raise_for_status()
        counts = defaultdict(lambda: [0, 0])
        for row in response.json()["data"]:
            name = row.get("model", "")
            if not row.get("is_rollup") or not name.startswith("community/"):
                continue
            count = counts[name.split("/")[1]]
            count[0] += int(row.get("status_2xx") or 0)
            count[1] += int(row.get("errors_5xx") or 0)
        return {owner: success / (success + errors) * 100
                for owner, (success, errors) in counts.items() if success + errors}
    except (requests.RequestException, ValueError, KeyError, TypeError, AttributeError):
        print("  Publisher success unavailable; posting catalog changes without rates")
        return None


def model_rows(job, diff, agent=None):
    groups = defaultdict(list)
    for kind, categories in diff.items():
        for category, entries in categories.items():
            for entry in entries:
                model = entry["after"] if kind == "changed" else entry
                if agent is not None and bool(model.get("agent")) != agent:
                    continue
                if kind == "changed":
                    changes = updates(entry["before"], model)
                    if not changes:
                        continue
                elif kind == "removed":
                    changes = []
                else:
                    features = ", ".join(label(v) for v in sorted(capabilities(model)))
                    modalities = " → ".join(", ".join(label(v) for v in model.get(field) or [])
                                            for field in ("input_modalities", "output_modalities"))
                    note = category if job == "community" else modalities.strip(" →")
                    if model.get("agent"):
                        note = f"Agent on {plain(model['base_model'])}" if model.get("base_model") else "Agent"
                    changes = [part for part in (note, features) if part]
                name = title(model)
                if job == "models" and model.get("publisher"):
                    name = f"{plain(model['publisher'][:80])} - {name}"
                suffix = access(model) if kind == "added" else ""
                # One colored marker per consecutive kind of change, not per field.
                detail, previous_color = "", None
                for change in changes:
                    detail += ("; " + change[2:]) if change[0] in "🟢🔴🔵" and change[0] == previous_color else (" · " if detail else "") + change
                    previous_color = change[0]
                separator = " " if kind == "changed" else " · "
                row = f"- **{name}**" + (separator + detail if detail else "") + (f" · {suffix}" if suffix else "")
                group = publisher(model) if job == "community" else category
                groups[group].append((name.casefold(), model["name"], row))
    return {key: [row for _, _, row in sorted(rows)] for key, rows in groups.items()}


def discord_length(text):
    return len(text.encode("utf-16-le")) // 2


def card_descriptions(groups, community, rates, links):
    """Pack whole rows, repeating a group's heading only if it crosses a card boundary."""
    descriptions, text = [], ""
    keys = sorted(groups, key=str.casefold) if community else [key for key in CATEGORIES if key in groups]
    for key in keys:
        heading = f"👤 {plain(key)}" if community else CATEGORIES[key]
        if community and rates is not None:
            heading += f" · {rates[key]:.1f}% success" if key in rates else " · No recent samples"
        heading = f"**{heading}**\n"
        for index, row in enumerate(groups[key]):
            addition = ("\n\n" if text else "") + heading + row if index == 0 else "\n" + row
            if discord_length(text + addition + "\n\n" + links) > 4096:
                if text:
                    descriptions.append(text)
                text = heading + row
                if discord_length(text + "\n\n" + links) > 4096:
                    raise ValueError("A model row exceeds Discord's card limit")
            else:
                text += addition
    if text:
        descriptions.append(text)
    return descriptions


def messages(job, diff, rates=None):
    community = job == "community"
    links = ("[Explore community models](https://enter.pollinations.ai/models?q=source%3Acommunity)" if community else
             "[Browse models](https://enter.pollinations.ai/models) · [API docs](https://gen.pollinations.ai/docs)")
    reports = (("Community model updates", False), ("Community agent updates", True)) if community else (("Official model updates", None),)
    actions = (("added", "✨ New", 0xA970E3), ("changed", "🔄 Updated", 0x5865F2), ("removed", "🗑️ Removed", 0xE49B50))
    result = []
    for report_title, agent in reports:
        first = True
        for kind, subtitle, color in actions:
            groups = model_rows(job, {kind: diff.get(kind, {})}, agent)
            for index, description in enumerate(card_descriptions(groups, community, rates, links)):
                content = f"## {report_title}\n" if first else ""
                if index == 0:
                    content += f"### {subtitle}"
                result.append({"content": content, "embeds": [{"description": description, "color": color}],
                               "allowed_mentions": {"parse": []}})
                first = False
    if result:
        embed = result[-1]["embeds"][0]
        embed["description"] += "\n\n" + links
        if community and rates is not None:
            embed["footer"] = {"text": "Publisher success over the last 7 days"}
    return result
