import { z } from "zod";

const API_ROOT = "https://re.jrc.ec.europa.eu/api/v5_2";
// PVGIS has no key and states no rate limit. peakpower is mandatory
// upstream (400 without it), so the handler default of 1 kWp is
// load-bearing, not cosmetic. slope 0 / azimuth 0 reproduce the API's
// own defaults (a flat panel); azimuth 0 is south, -90 east, 90 west,
// 180 north. A 35-degree south tilt in Berlin yields ~1,058 kWh/year
// against ~875 kWh flat for the same 1 kWp, so the tilt params matter.
export const pvgisTools = [
    [
        "solar_estimate",
        "Estimate yearly and monthly solar PV energy yield for one latitude/longitude pair from the EU JRC PVGIS calculator. Give a peak power in kWp (default 1) and system loss in percent (default 14); optional slope in degrees (0-90, default 0, flat) and azimuth in degrees (default 0, south; -90 east, 90 west, 180 north). No key needed. Radiation data is PVGIS-SARAH2, weather data ERA5 (2005-2020).",
        {
            latitude: z
                .number()
                .min(-90)
                .max(90)
                .describe("Latitude in decimal degrees (-90 to 90)"),
            longitude: z
                .number()
                .min(-180)
                .max(180)
                .describe("Longitude in decimal degrees (-180 to 180)"),
            peakpower: z
                .number()
                .positive()
                .max(1000)
                .optional()
                .default(1)
                .describe(
                    "Installed peak power in kWp (default 1, up to 1000)",
                ),
            loss: z
                .number()
                .min(0)
                .max(100)
                .optional()
                .default(14)
                .describe(
                    "Total system loss in percent (default 14, 0 to 100)",
                ),
            slope: z
                .number()
                .min(0)
                .max(90)
                .optional()
                .default(0)
                .describe(
                    "Panel tilt from horizontal in degrees (default 0, flat; 0 to 90)",
                ),
            azimuth: z
                .number()
                .min(-180)
                .max(180)
                .optional()
                .default(0)
                .describe(
                    "Panel azimuth in degrees (default 0, south; -90 east, 90 west, 180 north)",
                ),
        },
        async (
            { latitude, longitude, peakpower, loss, slope, azimuth },
            fetchJson,
        ) => {
            if (
                typeof latitude !== "number" ||
                !Number.isFinite(latitude) ||
                latitude < -90 ||
                latitude > 90
            ) {
                throw new Error(
                    "latitude must be a number between -90 and 90.",
                );
            }
            if (
                typeof longitude !== "number" ||
                !Number.isFinite(longitude) ||
                longitude < -180 ||
                longitude > 180
            ) {
                throw new Error(
                    "longitude must be a number between -180 and 180.",
                );
            }
            const kwp = peakpower ?? 1;
            if (
                typeof kwp !== "number" ||
                !Number.isFinite(kwp) ||
                kwp <= 0 ||
                kwp > 1000
            ) {
                throw new Error(
                    "peakpower must be a number greater than 0 and at most 1000.",
                );
            }
            const pct = loss ?? 14;
            if (
                typeof pct !== "number" ||
                !Number.isFinite(pct) ||
                pct < 0 ||
                pct > 100
            ) {
                throw new Error("loss must be a number between 0 and 100.");
            }
            const tilt = slope ?? 0;
            if (
                typeof tilt !== "number" ||
                !Number.isFinite(tilt) ||
                tilt < 0 ||
                tilt > 90
            ) {
                throw new Error("slope must be a number between 0 and 90.");
            }
            const az = azimuth ?? 0;
            if (
                typeof az !== "number" ||
                !Number.isFinite(az) ||
                az < -180 ||
                az > 180
            ) {
                throw new Error(
                    "azimuth must be a number between -180 and 180.",
                );
            }
            const data = await fetchJson(
                `${API_ROOT}/PVcalc?lat=${latitude}&lon=${longitude}&peakpower=${kwp}&loss=${pct}&angle=${tilt}&aspect=${az}&outputformat=json`,
            );
            const monthly = data?.outputs?.monthly?.fixed;
            const totals = data?.outputs?.totals?.fixed;
            if (
                !Array.isArray(monthly) ||
                !totals ||
                typeof totals !== "object"
            ) {
                throw new Error("PVGIS returned an unexpected response shape.");
            }
            const fixed = data.inputs?.mounting_system?.fixed;
            return {
                latitude: data.inputs?.location?.latitude ?? latitude,
                longitude: data.inputs?.location?.longitude ?? longitude,
                elevation: data.inputs?.location?.elevation ?? null,
                peakpower_kwp: data.inputs?.pv_module?.peak_power ?? kwp,
                loss_percent: data.inputs?.pv_module?.system_loss ?? pct,
                slope_deg: fixed?.slope?.value ?? tilt,
                azimuth_deg: fixed?.azimuth?.value ?? az,
                radiation_db: data.inputs?.meteo_data?.radiation_db ?? null,
                meteo_db: data.inputs?.meteo_data?.meteo_db ?? null,
                data_years:
                    data.inputs?.meteo_data?.year_min != null &&
                    data.inputs?.meteo_data?.year_max != null
                        ? `${data.inputs.meteo_data.year_min}-${data.inputs.meteo_data.year_max}`
                        : null,
                yearly_energy_kwh: totals.E_y,
                yearly_irradiation_kwh_m2: totals["H(i)_y"],
                monthly: monthly.map((m) => ({
                    month: m.month,
                    energy_kwh: m.E_m,
                    irradiation_kwh_m2: m["H(i)_m"],
                    std_dev_kwh: m.SD_m,
                })),
            };
        },
    ],
];
