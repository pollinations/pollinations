import base64
from loguru import logger
from pydub import AudioSegment
import io


def encode_audio_base64(audio_path: str) -> str:
    try:
        with open(audio_path, "rb") as audio_file:
            audio_bytes = audio_file.read()
            audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
        return audio_b64
    except Exception as e:
        raise RuntimeError(f"Failed to encode {audio_path} to base64: {e}")


if __name__ == "__main__":
    voices = ["alloy","echo","fable","onyx","nova","shimmer","coral","verse","ballad","ash","sage","amuch","dan"]
    for voice in voices:
        print(f"Processing voice: {voice}")
        audio = f"voices_b64/raw_wav/{voice}.wav"
        audio_b64 = encode_audio_base64(audio)
        with open(f"voices_b64/base64Data/{voice}_b64.txt", "w") as f:
            f.write(audio_b64)
    print("All voices processed and saved to base64 files.")