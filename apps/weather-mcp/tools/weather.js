import { z } from "zod";
import { getJson } from "../fetch.js";

// WMO weather codes: https://open-meteo.com/en/docs#weathervariables
const WEATHER_DESCRIPTIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Dense freezing drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Heavy freezing rain",
    71: "Slight snow",
    73: "Moderate snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Heavy snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
};

const COORDS = /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/;

function describe(code) {
    return WEATHER_DESCRIPTIONS[code] ?? `Unknown weather code ${code}`;
}

async function resolvePlace(place) {
    const coords = COORDS.exec(place.trim());
    if (coords) {
        const latitude = Number(coords[1]);
        const longitude = Number(coords[2]);
        if (
            latitude < -90 ||
            latitude > 90 ||
            longitude < -180 ||
            longitude > 180
        )
            throw new Error(
                "Coordinates out of range: latitude -90..90, longitude -180..180.",
            );
        return { latitude, longitude, name: `${latitude}, ${longitude}` };
    }
    const data = await getJson(
        `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(place)}&count=1&language=en&format=json`,
    );
    const hit = data.results?.[0];
    if (!hit) throw new Error(`No place found for "${place}".`);
    return {
        latitude: hit.latitude,
        longitude: hit.longitude,
        name: [hit.name, hit.admin1, hit.country].filter(Boolean).join(", "),
    };
}

export const weatherTools = [
    [
        "getWeather",
        'Current weather and a short forecast for a place, via Open-Meteo (free, no key). Give a place name ("Jakarta", "Paris, France") or "latitude, longitude".',
        z.object({
            place: z
                .string()
                .min(1)
                .describe('Place name, or "latitude, longitude"'),
            forecast_days: z
                .number()
                .int()
                .min(1)
                .max(7)
                .optional()
                .describe("Forecast days, 1-7 (default: 3)"),
            temperature_unit: z
                .enum(["celsius", "fahrenheit"])
                .optional()
                .describe("Temperature unit (default: celsius)"),
        }),
        async ({ place, forecast_days = 3, temperature_unit = "celsius" }) => {
            const { latitude, longitude, name } = await resolvePlace(place);
            const params = new URLSearchParams({
                latitude: String(latitude),
                longitude: String(longitude),
                current:
                    "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
                daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max",
                timezone: "auto",
                forecast_days: String(forecast_days),
                temperature_unit,
            });
            const data = await getJson(
                `https://api.open-meteo.com/v1/forecast?${params}`,
            );
            const current = data.current;
            const unit = temperature_unit === "fahrenheit" ? "°F" : "°C";
            return {
                place: name,
                latitude,
                longitude,
                timezone: data.timezone,
                current: {
                    time: current.time,
                    temperature: `${current.temperature_2m}${unit}`,
                    feels_like: `${current.apparent_temperature}${unit}`,
                    humidity: `${current.relative_humidity_2m}%`,
                    precipitation: `${current.precipitation} mm`,
                    condition: describe(current.weather_code),
                    wind: `${current.wind_speed_10m} km/h from ${current.wind_direction_10m}°`,
                },
                forecast: data.daily.time.map((date, i) => ({
                    date,
                    condition: describe(data.daily.weather_code[i]),
                    high: `${data.daily.temperature_2m_max[i]}${unit}`,
                    low: `${data.daily.temperature_2m_min[i]}${unit}`,
                    precipitation: `${data.daily.precipitation_sum[i]} mm`,
                    precipitation_probability:
                        data.daily.precipitation_probability_max[i] == null
                            ? null
                            : `${data.daily.precipitation_probability_max[i]}%`,
                })),
            };
        },
    ],
];
