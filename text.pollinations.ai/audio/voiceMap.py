import os
import sys
VOICE_BASE64_MAP = {
    "alloy":   "voices_b64/raw_wav/alloy.wav",
    "cedar":   "voices_b64/raw_wav/cedar.wav",
    "marin":   "voices_b64/raw_wav/marin.wav",
    "ash":     "voices_b64/raw_wav/ash.wav",
    "ballad":  "voices_b64/raw_wav/ballad.wav",
    "coral":   "voices_b64/raw_wav/coral.wav",
    "dan":     "voices_b64/raw_wav/dan.wav",
    "echo":    "voices_b64/raw_wav/echo.wav",
    "fable":   "voices_b64/raw_wav/fable.wav",
    "nova":    "voices_b64/raw_wav/nova.wav",
    "onyx":    "voices_b64/raw_wav/onyx.wav",
    "sage":    "voices_b64/raw_wav/sage.wav",
    "shimmer": "voices_b64/raw_wav/shimmer.wav",
    "verse":   "voices_b64/raw_wav/verse.wav",
    "ghost":   "voices_b64/raw_wav/ghost.wav",
}

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: python voiceMap.py <voice_name>")
        print("Available voices:", ", ".join(VOICE_BASE64_MAP.keys()))
        exit(1)
    voice = sys.argv[1]
    path = VOICE_BASE64_MAP.get(voice)
    if path:
        abs_path = os.path.abspath(path)
        print(f"Base64 file for '{voice}': {abs_path}")
    else:
        print(f"Voice '{voice}' not found. Available voices: {', '.join(VOICE_BASE64_MAP.keys())}")