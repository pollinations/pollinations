// FuelEconomy.gov (US EPA) vehicle fuel economy, via the public menu API.
// No key. The API answers JSON when asked with Accept: application/json,
// which is what the shared fetch layer sends by default — no XML parsing.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const API_ROOT = "https://www.fueleconomy.gov/ws/rest/vehicle";
const MIN_YEAR = 1984;

function menuItems(data) {
    if (data === null || data === undefined) return [];
    const items = data.menuItem;
    if (!items) return [];
    return Array.isArray(items) ? items : [items];
}

function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function clean(value) {
    const s = String(value ?? "").trim();
    return s.length > 0 ? s : null;
}

async function fetchMenu(path, params) {
    const url = new URL(`${API_ROOT}/menu/${path}`);
    for (const [key, value] of Object.entries(params))
        url.searchParams.set(key, String(value));
    return fetchJson(url);
}

export const fuelEconomyTools = [
    [
        "fueleconomy_mpg",
        "Look up EPA fuel economy (city, highway and combined MPG; MPGe for electric vehicles) for a US vehicle by year, make and model, via fueleconomy.gov. Returns the first matching trim unless option names one (a vehicle id or part of its description, e.g. 'Auto (AM-S8)'). Also returns fuel type, transmission, drive, engine, vehicle class, annual fuel cost and CO2 per mile. NHTSA recalls and safety ratings are a different tool.",
        {
            year: z.number().int().min(MIN_YEAR).max(2100),
            make: z.string().trim().min(1).max(100),
            model: z.string().trim().min(1).max(100),
            option: z.string().trim().min(1).max(200).optional(),
        },
        async ({ year, make, model, option }) => {
            const maxYear = new Date().getFullYear() + 1;
            if (year > maxYear)
                throw new Error(
                    `FuelEconomy data only goes to ${maxYear}; year ${year} is too far ahead.`,
                );
            if (!make.trim() || !model.trim())
                throw new Error("make and model must not be blank.");
            if (option !== undefined && !option.trim())
                throw new Error("option must not be blank.");

            // 1. Model menu validates the make and resolves the model name.
            const models = menuItems(
                await fetchMenu("model", { year, make: make.trim() }),
            );
            const wanted = model.trim().toLowerCase();
            const match = models.find(
                (m) => String(m.value ?? m.text ?? "").toLowerCase() === wanted,
            );
            if (!match) {
                const names = models
                    .map((m) => m.value ?? m.text)
                    .filter(Boolean)
                    .slice(0, 20);
                throw new Error(
                    models.length === 0
                        ? `No models found for make "${make.trim()}" in ${year}.`
                        : `No model "${model.trim()}" for ${make.trim()} in ${year}. Available models: ${names.join(", ")}.`,
                );
            }
            const modelName = String(match.value ?? match.text);

            // 2. Options menu resolves the model to a vehicle id (a trim).
            const options = menuItems(
                await fetchMenu("options", {
                    year,
                    make: make.trim(),
                    model: modelName,
                }),
            );
            if (options.length === 0)
                throw new Error(
                    `No trims found for ${year} ${make.trim()} ${modelName}.`,
                );
            let picked = options[0];
            if (option !== undefined) {
                const want = option.trim();
                picked =
                    options.find((o) => String(o.value) === want) ??
                    options.find((o) =>
                        String(o.text ?? "")
                            .toLowerCase()
                            .includes(want.toLowerCase()),
                    );
                if (!picked) {
                    const texts = options
                        .map((o) => o.text)
                        .filter(Boolean)
                        .slice(0, 10);
                    throw new Error(
                        `No trim "${want}" for ${year} ${make.trim()} ${modelName}. Available trims: ${texts.join(" | ")}.`,
                    );
                }
            }
            const vehicleId = String(picked.value);
            const optionText = clean(picked.text);

            // 3. Vehicle record carries the MPG figures.
            let vehicle;
            try {
                vehicle = await fetchJson(`${API_ROOT}/${vehicleId}`);
            } catch (error) {
                if (/HTTP 404/.test(error.message))
                    throw new Error(
                        `No FuelEconomy record found for vehicle ${vehicleId}.`,
                    );
                throw error;
            }
            if (!vehicle || typeof vehicle !== "object" || !vehicle.id)
                throw new Error(
                    `No FuelEconomy record found for vehicle ${vehicleId}.`,
                );

            return {
                year: num(vehicle.year) ?? year,
                make: clean(vehicle.make) ?? make.trim(),
                model: clean(vehicle.model) ?? modelName,
                option: optionText,
                vehicle_id: String(vehicle.id),
                city_mpg: num(vehicle.city08),
                highway_mpg: num(vehicle.highway08),
                combined_mpg: num(vehicle.comb08),
                fuel_type: clean(vehicle.fuelType1),
                transmission: clean(vehicle.trany),
                drive: clean(vehicle.drive),
                cylinders: num(vehicle.cylinders),
                displacement_l: num(vehicle.displ),
                vehicle_class: clean(vehicle.VClass),
                annual_fuel_cost_usd: num(vehicle.fuelCost08),
                co2_g_per_mile: num(vehicle.co2),
                fuel_economy_score: num(vehicle.feScore),
                url: `${API_ROOT}/${vehicleId}`,
            };
        },
    ],
];
