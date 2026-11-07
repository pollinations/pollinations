import * as z from "zod";
import { readResponseText } from "../../../shared/response-bytes.ts";

// Data: Open-Meteo (https://open-meteo.com). Keyless; free for non-commercial
// and commercial use with attribution to Open-Meteo.
const USER_AGENT = "weather-mcp/0.1 (https://pollinations.ai)";
const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
const GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search";

// WMO weather interpretation codes, as returned by Open-Meteo.
const WEATHER_CODES = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Drizzle",
    55: "Dense drizzle",
    56: "Light freezing drizzle",
    57: "Freezing drizzle",
    61: "Slight rain",
    63: "Rain",
    65: "Heavy rain",
    66: "Light freezing rain",
    67: "Freezing rain",
    71: "Slight snow",
    73: "Snow",
    75: "Heavy snow",
    77: "Snow grains",
    80: "Slight rain showers",
    81: "Rain showers",
    82: "Violent rain showers",
    85: "Slight snow showers",
    86: "Snow showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
};

export const weatherText = (code) =>
    WEATHER_CODES[code] ?? `Unknown weather (code ${code})`;

async function openMeteo(url, params) {
    const query = new URLSearchParams(
        Object.entries(params).map(([key, value]) => [key, String(value)]),
    );
    const response = await fetch(`${url}?${query}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
        redirect: "follow",
    });
    try {
        if (!response.ok)
            throw new Error(`Open-Meteo answered HTTP ${response.status}`);
        return JSON.parse(
            await readResponseText(
                response,
                512 * 1024,
                () => new Error("Open-Meteo response exceeds 512 KiB."),
            ),
        );
    } finally {
        await response.body?.cancel();
    }
}

const latitude = z
    .number()
    .min(-90)
    .max(90)
    .describe("Latitude in decimal degrees, for example 47.4979");
const longitude = z
    .number()
    .min(-180)
    .max(180)
    .describe("Longitude in decimal degrees, for example 19.0402");

export const weatherTools = [
    [
        "geocode_place",
        "Find places by name. Returns coordinates, country, region, timezone and population for each match; use the coordinates with the other weather tools.",
        {
            query: z
                .string()
                .min(1)
                .max(100)
                .describe("Place name, for example Budapest"),
            count: z
                .number()
                .int()
                .min(1)
                .max(10)
                .default(5)
                .describe("Maximum number of matches to return"),
        },
        async ({ query, count }) => {
            const data = await openMeteo(GEOCODING_URL, {
                name: query,
                count,
                language: "en",
                format: "json",
            });
            return (data.results ?? []).map((place) => ({
                name: place.name,
                country: place.country ?? null,
                region: place.admin1 ?? null,
                latitude: place.latitude,
                longitude: place.longitude,
                timezone: place.timezone ?? null,
                population: place.population ?? null,
            }));
        },
    ],
    [
        "current_weather",
        "Current weather conditions at a location: temperature, apparent temperature, humidity, conditions, precipitation, pressure and wind.",
        { latitude, longitude },
        async ({ latitude, longitude }) => {
            const data = await openMeteo(FORECAST_URL, {
                latitude,
                longitude,
                current:
                    "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m",
                timezone: "auto",
                forecast_days: 1,
            });
            const current = data.current;
            return {
                time: current.time,
                timezone: data.timezone,
                temperatureC: current.temperature_2m,
                apparentTemperatureC: current.apparent_temperature,
                humidityPercent: current.relative_humidity_2m,
                weather: weatherText(current.weather_code),
                weatherCode: current.weather_code,
                precipitationMm: current.precipitation,
                pressureHpa: current.surface_pressure,
                windSpeedKmh: current.wind_speed_10m,
                windDirectionDeg: current.wind_direction_10m,
                windGustsKmh: current.wind_gusts_10m,
                isDay: current.is_day === 1,
            };
        },
    ],
    [
        "forecast_daily",
        "Daily weather forecast at a location: conditions, high and low temperature, precipitation, sunrise, sunset and max wind per day.",
        {
            latitude,
            longitude,
            days: z
                .number()
                .int()
                .min(1)
                .max(16)
                .default(7)
                .describe("Number of forecast days, starting today"),
        },
        async ({ latitude, longitude, days }) => {
            const data = await openMeteo(FORECAST_URL, {
                latitude,
                longitude,
                daily: "weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,precipitation_sum,precipitation_probability_max,wind_speed_10m_max",
                timezone: "auto",
                forecast_days: days,
            });
            const daily = data.daily;
            return {
                timezone: data.timezone,
                days: daily.time.map((date, index) => ({
                    date,
                    weather: weatherText(daily.weather_code[index]),
                    weatherCode: daily.weather_code[index],
                    temperatureMaxC: daily.temperature_2m_max[index],
                    temperatureMinC: daily.temperature_2m_min[index],
                    precipitationMm: daily.precipitation_sum[index],
                    precipitationProbabilityMaxPercent:
                        daily.precipitation_probability_max[index] ?? null,
                    sunrise: daily.sunrise[index],
                    sunset: daily.sunset[index],
                    windSpeedMaxKmh: daily.wind_speed_10m_max[index],
                })),
            };
        },
    ],
    [
        "forecast_hourly",
        "Hourly weather forecast at a location, starting from the current hour: temperature, conditions and precipitation chance per hour.",
        {
            latitude,
            longitude,
            hours: z
                .number()
                .int()
                .min(1)
                .max(48)
                .default(24)
                .describe("Number of hours to return, starting now"),
        },
        async ({ latitude, longitude, hours }) => {
            const data = await openMeteo(FORECAST_URL, {
                latitude,
                longitude,
                hourly: "temperature_2m,weather_code,precipitation,precipitation_probability",
                timezone: "auto",
                forecast_days: Math.ceil(hours / 24) + 1,
            });
            const hourly = data.hourly;
            // Hourly times are local ISO strings. Shift UTC now by the
            // location's offset to find the current local hour.
            const localNow = new Date(
                Date.now() + data.utc_offset_seconds * 1000,
            );
            const currentHour = `${localNow.toISOString().slice(0, 13)}:00`;
            const start = hourly.time.findIndex((time) => time >= currentHour);
            const from = start === -1 ? 0 : start;
            return {
                timezone: data.timezone,
                hours: hourly.time
                    .slice(from, from + hours)
                    .map((time, offset) => {
                        const index = from + offset;
                        return {
                            time,
                            temperatureC: hourly.temperature_2m[index],
                            weather: weatherText(hourly.weather_code[index]),
                            weatherCode: hourly.weather_code[index],
                            precipitationMm: hourly.precipitation[index],
                            precipitationProbabilityPercent:
                                hourly.precipitation_probability[index] ?? null,
                        };
                    }),
            };
        },
    ],
];
