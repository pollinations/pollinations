import { arrayBufferToBase64 } from "@/util.ts";
import type {
    ChatMessage,
    ServiceError,
    TransformOptions,
    TransformResult,
} from "../types.js";

const PCM16_SAMPLE_RATE = 24_000;

function invalidAudio(message: string): never {
    const error = new Error(message) as ServiceError;
    error.status = 400;
    throw error;
}

function decodeBase64Audio(data: string): Uint8Array {
    try {
        const binary = atob(data);
        return Uint8Array.from(binary, (character) => character.charCodeAt(0));
    } catch {
        return invalidAudio("input_audio.data must be valid base64 audio.");
    }
}

function startsWith(bytes: Uint8Array, signature: string): boolean {
    return [...signature].every(
        (character, index) => bytes[index] === character.charCodeAt(0),
    );
}

function validateContainer(bytes: Uint8Array, format: string): void {
    const valid =
        (format === "wav" &&
            startsWith(bytes, "RIFF") &&
            startsWith(bytes.subarray(8), "WAVE")) ||
        (format === "mp3" &&
            (startsWith(bytes, "ID3") ||
                (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0))) ||
        (format === "flac" && startsWith(bytes, "fLaC")) ||
        (format === "opus" && startsWith(bytes, "OggS")) ||
        (format === "pcm16" && bytes.length > 0 && bytes.length % 2 === 0);

    if (!valid) invalidAudio(`input_audio.data is not valid ${format} audio.`);
}

function wrapPcm16InWav(pcm: Uint8Array): Uint8Array {
    const wav = new Uint8Array(44 + pcm.length);
    const view = new DataView(wav.buffer);
    const writeText = (offset: number, value: string) => {
        for (let index = 0; index < value.length; index += 1) {
            wav[offset + index] = value.charCodeAt(index);
        }
    };

    writeText(0, "RIFF");
    view.setUint32(4, 36 + pcm.length, true);
    writeText(8, "WAVE");
    writeText(12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, PCM16_SAMPLE_RATE, true);
    view.setUint32(28, PCM16_SAMPLE_RATE * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);
    writeText(36, "data");
    view.setUint32(40, pcm.length, true);
    wav.set(pcm, 44);
    return wav;
}

/** Convert OpenAI input_audio parts to Fireworks' audio_url request shape. */
export function inputAudioToFireworks(
    messages: ChatMessage[],
    options: TransformOptions,
): TransformResult {
    return {
        messages: messages.map((message) => {
            if (!Array.isArray(message.content)) return message;

            const content = message.content.map((part) => {
                if (!part || typeof part !== "object" || Array.isArray(part)) {
                    return part;
                }

                const record = part as Record<string, unknown>;
                const inputAudio = record.input_audio;
                if (
                    record.type !== "input_audio" ||
                    !inputAudio ||
                    typeof inputAudio !== "object" ||
                    Array.isArray(inputAudio)
                ) {
                    return part;
                }

                const { data, format } = inputAudio as Record<string, unknown>;
                if (typeof data !== "string" || typeof format !== "string") {
                    return part;
                }

                const bytes = decodeBase64Audio(data);
                validateContainer(bytes, format);
                const isPcm16 = format === "pcm16";
                const encodedAudio = isPcm16
                    ? arrayBufferToBase64(wrapPcm16InWav(bytes))
                    : data;

                return {
                    type: "audio_url",
                    audio_url: {
                        url: `data:audio/${isPcm16 ? "wav" : format === "opus" ? "ogg" : format};base64,${encodedAudio}`,
                    },
                };
            });

            return { ...message, content };
        }),
        options,
    };
}
