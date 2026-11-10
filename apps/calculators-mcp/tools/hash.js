import { z } from "zod";

const algorithmEnum = z.enum(["SHA-256", "SHA-384", "SHA-512", "SHA-1"]);

export const hashTools = [
    [
        "calculate_hash",
        "Calculate cryptographic digest hashes (SHA-256, SHA-384, SHA-512, SHA-1) of text. Runs locally using standard Web Crypto API without external network calls.",
        {
            text: z
                .string()
                .min(1)
                .max(100_000)
                .describe(
                    "Text content to calculate hash for (up to 100,000 characters)",
                ),
            algorithm: algorithmEnum
                .default("SHA-256")
                .describe("Hash algorithm to use (default: SHA-256)"),
            encoding: z
                .enum(["hex", "base64"])
                .default("hex")
                .describe("Output encoding (hex or base64, default: hex)"),
        },
        async ({ text, algorithm, encoding }) => {
            const data = new TextEncoder().encode(text);
            const digestBuffer = await crypto.subtle.digest(algorithm, data);
            const digestBytes = new Uint8Array(digestBuffer);

            let hash = "";
            if (encoding === "hex") {
                hash = Array.from(digestBytes)
                    .map((b) => b.toString(16).padStart(2, "0"))
                    .join("");
            } else {
                // Base64 encoding
                let binary = "";
                for (let i = 0; i < digestBytes.byteLength; i++) {
                    binary += String.fromCharCode(digestBytes[i]);
                }
                hash = btoa(binary);
            }

            return {
                algorithm,
                encoding,
                byteLength: digestBytes.byteLength,
                hash,
            };
        },
    ],
];
