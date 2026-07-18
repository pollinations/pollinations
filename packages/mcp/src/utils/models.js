import { API_BASE_URL, fetchJsonWithAuth } from "./coreUtils.js";

const fetchRegistry = (path) =>
    fetchJsonWithAuth(`${API_BASE_URL}${path}`, { timeoutMs: 20000 });

export const getImageModels = () => fetchRegistry("/image/models");
export const getTextModels = () => fetchRegistry("/text/models");
export const getAudioModels = () => fetchRegistry("/audio/models");

export async function getAudioVoices() {
    try {
        const audioModels = await getAudioModels();
        const voices = new Set();
        for (const m of audioModels) {
            if (Array.isArray(m.voices)) {
                for (const v of m.voices) voices.add(v);
            }
        }
        if (voices.size > 0) return Array.from(voices);
    } catch {}
    // Last-resort fallback. Keep in sync with AUDIO_VOICES in
    // shared/registry/text.ts (the canonical list the API serves).
    return [
        "alloy",
        "echo",
        "fable",
        "onyx",
        "nova",
        "shimmer",
        "coral",
        "verse",
        "ballad",
        "ash",
        "sage",
        "amuch",
        "dan",
    ];
}

export async function validateVoice(voice) {
    if (!voice) return { valid: true };
    const voices = await getAudioVoices();
    if (voices.includes(voice)) return { valid: true };
    const lower = voice.toLowerCase();
    const suggestions = voices
        .filter(
            (v) =>
                v.toLowerCase().includes(lower) ||
                lower.includes(v.toLowerCase()),
        )
        .slice(0, 3);
    return {
        valid: false,
        error: `Unknown voice "${voice}".`,
        suggestions: suggestions.length > 0 ? suggestions : voices.slice(0, 8),
        availableCount: voices.length,
    };
}
