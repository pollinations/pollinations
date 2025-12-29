import { useMemo } from "react";

/**
 * Custom hook to generate a Pollinations audio URL for text-to-speech.
 *
 * @param {string} text - The text to convert to speech.
 * @param {Object} [options] - Optional parameters for audio generation.
 * @param {string} [options.voice='nova'] - The voice to use (alloy, echo, fable, onyx, nova, shimmer).
 * @param {string} [options.model='openai-audio'] - The model to use for audio generation.
 * @param {number} [options.seed=42] - The seed for consistent audio generation.
 * @returns {string} - The URL of the generated audio.
 */
const usePollinationsAudio = (text, options = {}) => {
    const {
        voice = "nova",
        model = "openai-audio",
        seed = 42,
    } = options;

    const audioUrl = useMemo(() => {
        if (!text) return null;
        const params = new URLSearchParams({
            model,
            voice,
            seed,
        });
        return `https://text.pollinations.ai/${encodeURIComponent(text)}?${params.toString()}`;
    }, [text, model, voice, seed]);

    return audioUrl;
};

export default usePollinationsAudio;
