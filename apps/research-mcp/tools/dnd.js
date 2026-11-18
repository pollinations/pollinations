// D&D 5e SRD lookup via the free D&D 5e API (dnd5eapi.co), no key.
// SRD content only — the API carries the free 2014 System Reference Document,
// not the full Player's Handbook. The unversioned /api/spells/... path 301s
// to /api/2014/..., so the versioned URL is used directly.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.dnd5eapi.co/api/2014";
const MAX_TEXT = 2000;

const indexSchema = z
    .string()
    .min(1)
    .max(100)
    .describe(
        "Spell, monster or equipment name or index, for example fireball, goblin or longsword.",
    );

function toIndex(name) {
    const index = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(index))
        throw new Error(
            `Use a D&D 5e name or index, for example fireball, got ${JSON.stringify(name)}.`,
        );
    return index;
}

function cap(text) {
    if (typeof text !== "string") return text ?? null;
    return text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT)}…` : text;
}

function joinText(parts) {
    return cap((parts ?? []).join("\n\n")) || null;
}

function names(items) {
    return (items ?? []).map((item) => item.name).filter(Boolean);
}

function spell(data) {
    const damage = data.damage?.[0];
    return {
        index: data.index,
        name: data.name,
        level: data.level,
        school: data.school?.name ?? null,
        casting_time: data.casting_time ?? null,
        range: data.range ?? null,
        duration: data.duration ?? null,
        concentration: data.concentration ?? null,
        ritual: data.ritual ?? null,
        components: data.components ?? [],
        material: data.material ?? null,
        desc: joinText(data.desc),
        higher_level: joinText(data.higher_level),
        damage: damage
            ? {
                  type: damage.damage_type?.name ?? null,
                  at_slot_level: damage.damage_at_slot_level ?? null,
                  at_character_level: damage.damage_at_character_level ?? null,
              }
            : null,
        dc: data.dc
            ? {
                  type: data.dc.dc_type?.name ?? null,
                  success: data.dc.dc_success ?? null,
              }
            : null,
        area_of_effect: data.area_of_effect ?? null,
        classes: names(data.classes),
        subclasses: names(data.subclasses),
        url: `${API_ROOT}/spells/${data.index}`,
    };
}

function monster(data) {
    const armor = data.armor_class?.[0];
    return {
        index: data.index,
        name: data.name,
        size: data.size ?? null,
        type: data.type ?? null,
        subtype: data.subtype ?? null,
        alignment: data.alignment ?? null,
        armor_class: armor
            ? { type: armor.type ?? null, value: armor.value ?? null }
            : null,
        hit_points: data.hit_points ?? null,
        hit_dice: data.hit_dice ?? null,
        speed: data.speed ?? null,
        abilities: {
            strength: data.strength ?? null,
            dexterity: data.dexterity ?? null,
            constitution: data.constitution ?? null,
            intelligence: data.intelligence ?? null,
            wisdom: data.wisdom ?? null,
            charisma: data.charisma ?? null,
        },
        challenge_rating: data.challenge_rating ?? null,
        xp: data.xp ?? null,
        proficiency_bonus: data.proficiency_bonus ?? null,
        senses: data.senses ?? null,
        languages: data.languages ?? null,
        damage_vulnerabilities: data.damage_vulnerabilities ?? [],
        damage_resistances: data.damage_resistances ?? [],
        damage_immunities: data.damage_immunities ?? [],
        condition_immunities: data.condition_immunities ?? [],
        special_abilities: (data.special_abilities ?? []).map((ability) => ({
            name: ability.name,
            desc: cap(ability.desc),
        })),
        actions: (data.actions ?? []).map((action) => ({
            name: action.name,
            desc: cap(action.desc),
            attack_bonus: action.attack_bonus ?? null,
            damage: (action.damage ?? []).map((d) => ({
                type: d.damage_type?.name ?? null,
                dice: d.damage_dice ?? null,
            })),
        })),
        legendary_actions: (data.legendary_actions ?? []).map((action) => ({
            name: action.name,
            desc: cap(action.desc),
        })),
        url: `${API_ROOT}/monsters/${data.index}`,
    };
}

function equipment(data) {
    return {
        index: data.index,
        name: data.name,
        category: data.equipment_category?.name ?? null,
        weapon_category: data.weapon_category ?? null,
        weapon_range: data.weapon_range ?? null,
        category_range: data.category_range ?? null,
        cost: data.cost ?? null,
        damage: data.damage
            ? {
                  dice: data.damage.damage_dice ?? null,
                  type: data.damage.damage_type?.name ?? null,
              }
            : null,
        range: data.range ?? null,
        weight: data.weight ?? null,
        properties: names(data.properties),
        two_handed_damage: data.two_handed_damage
            ? {
                  dice: data.two_handed_damage.damage_dice ?? null,
                  type: data.two_handed_damage.damage_type?.name ?? null,
              }
            : null,
        armor_class: data.armor_class ?? null,
        str_minimum: data.str_minimum ?? null,
        stealth_disadvantage: data.stealth_disadvantage ?? null,
        desc: joinText(data.desc),
        special: joinText(data.special),
        contents: (data.contents ?? []).map((item) => ({
            item: item.item?.name ?? null,
            quantity: item.quantity ?? null,
        })),
        url: `${API_ROOT}/equipment/${data.index}`,
    };
}

export const dndTools = [
    [
        "dnd_spell",
        "Look up a Dungeons & Dragons 5th edition spell from the free SRD: description, level, school, casting time, range, duration, damage and classes. SRD spells only — non-SRD spells are not in this database.",
        { name: indexSchema },
        async ({ name }) => {
            const index = toIndex(name);
            return spell(await fetchJson(`${API_ROOT}/spells/${index}`));
        },
    ],
    [
        "dnd_monster",
        "Look up a Dungeons & Dragons 5th edition monster from the free SRD: size, type, alignment, armor class, hit points, ability scores, challenge rating, senses, languages, special abilities and actions. SRD monsters only — non-SRD monsters are not in this database.",
        { name: indexSchema },
        async ({ name }) => {
            const index = toIndex(name);
            return monster(await fetchJson(`${API_ROOT}/monsters/${index}`));
        },
    ],
    [
        "dnd_equipment",
        "Look up a Dungeons & Dragons 5th edition weapon, armor or adventuring-gear item from the free SRD: cost, damage, range, weight, properties and description. SRD equipment only.",
        { name: indexSchema },
        async ({ name }) => {
            const index = toIndex(name);
            return equipment(await fetchJson(`${API_ROOT}/equipment/${index}`));
        },
    ],
];
