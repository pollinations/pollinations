// US NHTSA vehicle data: decode a VIN and look up safety recalls. Both
// endpoints are keyless, one fetch per call. The VIN decoder answers 141
// variables per call, so the tool projects hard to the nine fields an agent
// actually asks about; a bad VIN still answers HTTP 200 with a non-zero
// Error Code, which the tool turns into a named error instead of returning
// 141 empty rows.
import { z } from "zod";
import { fetchJson } from "../fetch.js";

const VIN_API = "https://vpic.nhtsa.dot.gov/api/vehicles";
const RECALLS_API = "https://api.nhtsa.gov/recalls";
const SUMMARY_MAX = 500;

// A VIN is 17 characters and never contains I, O or Q.
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

function normalizeVin(vin) {
    const cleaned = String(vin).trim().toUpperCase();
    if (!VIN_PATTERN.test(cleaned))
        throw new Error(
            "Provide a 17-character VIN using letters and digits (I, O and Q never appear in a VIN).",
        );
    return cleaned;
}

function variableValue(rows, name) {
    const row = rows.find((row) => row?.Variable === name);
    const value = row?.Value;
    if (value === null || value === undefined) return null;
    const text = String(value).trim();
    return text === "" ? null : text;
}

function recallSummary(recall) {
    return {
        campaign_number: recall.NHTSACampaignNumber ?? null,
        component: recall.Component ?? null,
        summary:
            typeof recall.Summary === "string" &&
            recall.Summary.length > SUMMARY_MAX
                ? `${recall.Summary.slice(0, SUMMARY_MAX)}…`
                : (recall.Summary ?? null),
        report_received_date: recall.ReportReceivedDate ?? null,
    };
}

export const nhtsaTools = [
    [
        "vin_decode",
        "Decode a 17-character vehicle identification number (VIN) with the US NHTSA database: make, model, model year, body class, fuel type, engine, drive type, manufacturer and vehicle type. No key needed.",
        {
            vin: z
                .string()
                .min(17)
                .max(17)
                .regex(/^[A-Za-z0-9]{17}$/)
                .describe(
                    "The 17-character VIN, for example 1HGCM82633A004352 for a 2003 Honda Accord.",
                ),
        },
        async ({ vin }) => {
            const cleaned = normalizeVin(vin);
            const data = await fetchJson(
                `${VIN_API}/DecodeVin/${cleaned}?format=json`,
            );
            const rows = data?.Results;
            if (!Array.isArray(rows))
                throw new Error("NHTSA returned an unexpected VIN response.");
            const errorCode = variableValue(rows, "Error Code");
            if (errorCode !== null && errorCode !== "0")
                throw new Error(
                    `NHTSA could not decode VIN ${cleaned}: ${variableValue(rows, "Error Text") ?? `error code ${errorCode}`}.`,
                );
            return {
                vin: cleaned,
                make: variableValue(rows, "Make"),
                model: variableValue(rows, "Model"),
                model_year: variableValue(rows, "Model Year"),
                body_class: variableValue(rows, "Body Class"),
                fuel_type: variableValue(rows, "Fuel Type - Primary"),
                engine_model: variableValue(rows, "Engine Model"),
                drive_type: variableValue(rows, "Drive Type"),
                manufacturer: variableValue(rows, "Manufacturer Name"),
                vehicle_type: variableValue(rows, "Vehicle Type"),
            };
        },
    ],
    [
        "vehicle_recalls",
        "Look up US NHTSA safety recalls for a vehicle by make, model and model year: campaign number, component, summary and report date for each recall. No key needed.",
        {
            make: z
                .string()
                .min(1)
                .max(50)
                .describe("Vehicle make, for example toyota."),
            model: z
                .string()
                .min(1)
                .max(50)
                .describe("Vehicle model, for example camry."),
            modelYear: z
                .number()
                .int()
                .min(1900)
                .max(2100)
                .describe("Model year, for example 2020."),
        },
        async ({ make, model, modelYear }) => {
            const cleanMake = String(make).trim();
            const cleanModel = String(model).trim();
            if (!cleanMake || !cleanModel)
                throw new Error("Provide a make and a model.");
            if (
                !Number.isInteger(modelYear) ||
                modelYear < 1900 ||
                modelYear > 2100
            )
                throw new Error(
                    "modelYear must be an integer between 1900 and 2100.",
                );
            const url = new URL(`${RECALLS_API}/recallsByVehicle`);
            url.search = new URLSearchParams({
                make: cleanMake,
                model: cleanModel,
                modelYear: String(modelYear),
            }).toString();
            let data;
            try {
                data = await fetchJson(url);
            } catch (error) {
                // NHTSA answers an unknown make/model with HTTP 400 and an
                // empty results list, not an error — return that as no recalls.
                if (/HTTP 400/.test(error.message))
                    return {
                        make: cleanMake,
                        model: cleanModel,
                        model_year: modelYear,
                        total: 0,
                        recalls: [],
                    };
                throw error;
            }
            const rows = Array.isArray(data?.results) ? data.results : [];
            return {
                make: cleanMake,
                model: cleanModel,
                model_year: modelYear,
                total: rows.length,
                recalls: rows.map(recallSummary),
            };
        },
    ],
];
