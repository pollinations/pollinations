from voiceMap import VOICE_BASE64_MAP
import asyncio
from typing import Optional
import os
import threading
import time
import torch
import torchaudio
import io 
import numpy as np
import re

def normalize_text(text: str, remove_punctuation: bool = False) -> str:
    text = text.strip()
    text = re.sub(r'\s+([.,!?;:])', r'\1', text)  
    text = re.sub(r'([.,!?;:])\s*([.,!?;:])', r'\1 \2', text)  
    if remove_punctuation:
        # Remove all punctuation but keep spaces
        text = re.sub(r'[.,!?;:\'""-]', '', text)
        # Clean up multiple spaces
        text = re.sub(r'\s+', ' ', text)
    else:
        # Keep punctuation but clean up multiple spaces
        text = re.sub(r'\s+', ' ', text)
    
    return text

async def generate_tts(text: str, requestID: str, model, language_id: str = "en",  voice: Optional[str] = "alloy", speed: float = 0.5, exaggeration: float = 0.0, cfg_weight: float = 7.0, normalize: bool = False) -> tuple:
    clone_path = None
    if normalize:
        text = normalize_text(text, remove_punctuation=False)
        print(f"[{requestID}] Text normalized (punctuation preserved)")
    else:
        text = normalize_text(text, remove_punctuation=False)
    
    if voice and VOICE_BASE64_MAP.get(voice):
        clone_path = VOICE_BASE64_MAP.get(voice)
        print(f"[{requestID}] Using predefined voice: {voice}")
    elif voice:
        try:
            if os.path.isfile(voice):
                clone_path = voice
                print(f"[{requestID}] Using voice file: {voice}")
            else:
                print(f"[{requestID}] Voice '{voice}' not found in list and not a valid file. Falling back to alloy.")
                clone_path = VOICE_BASE64_MAP.get("alloy")
        except Exception as e:
            print(f"[{requestID}] Error with voice '{voice}': {e}. Falling back to alloy.")
            clone_path = VOICE_BASE64_MAP.get("alloy")
    else:
        clone_path = VOICE_BASE64_MAP.get("alloy")
        print(f"[{requestID}] No voice specified, using default: alloy")
    
    content = text
    print(f"[{requestID}] Generated content: {content[:100]}...")
    print(f"[{requestID}] Language: {language_id}, Expressive parameters - speed: {speed:.2f} (0-1.0), exaggeration: {exaggeration:.2f}, cfg_weight: {cfg_weight:.2f}")
    
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"[{requestID}] Generating TTS audio with voice: {voice}, language: {language_id} (attempt {attempt + 1}/{max_retries})")
            try:
                wav = model.generate(
                    text=content,
                    language_id=language_id,
                    top_p=0.9,
                    temperature=0.6 + (exaggeration * 0.2),
                    repetition_penalty=1.2,
                    audio_prompt_path=clone_path
                )
                sample_rate = model.sr
            except Exception as syn_error:
                raise
            
            if wav is None:
                raise RuntimeError("Audio generation failed - GPU out of memory or other error")

            # Validate output - check if audio is too short (possible incomplete synthesis)
            if isinstance(wav, torch.Tensor):
                audio_duration = wav.shape[-1] / model.sr
            elif isinstance(wav, np.ndarray):
                audio_duration = wav.shape[-1] / model.sr if wav.ndim > 1 else len(wav) / model.sr
            else:
                audio_duration = len(wav) / model.sr
            
            # Estimate minimum expected duration (rough: ~0.5 sec per 10 characters)
            min_expected_duration = len(content) / 20.0
            
            if audio_duration < min_expected_duration * 0.5 and attempt < max_retries - 1:
                print(f"[{requestID}] Warning: Audio seems incomplete ({audio_duration:.2f}s < {min_expected_duration:.2f}s expected). Retrying...")
                await asyncio.sleep(1)
                continue

            if isinstance(wav, torch.Tensor):
                audio_tensor = wav
            elif isinstance(wav, np.ndarray):
                audio_tensor = torch.from_numpy(wav)
            else:
                audio_tensor = torch.from_numpy(np.array(wav))

            if audio_tensor.dim() == 1:
                audio_tensor = audio_tensor.unsqueeze(0)  
            elif audio_tensor.dim() > 2:
                audio_tensor = audio_tensor.squeeze()  
                if audio_tensor.dim() == 1:
                    audio_tensor = audio_tensor.unsqueeze(0)
            
            buffer = io.BytesIO()
            torchaudio.save(buffer, audio_tensor, sample_rate, format="wav")
            audio_bytes = buffer.getvalue()
            
            print(f"[{requestID}] TTS generation completed. Audio bytes: {len(audio_bytes)}, Sample rate: {sample_rate}")
            return audio_bytes, sample_rate
            
        except Exception as e:
            print(f"[{requestID}] Error during TTS generation (attempt {attempt + 1}): {e}")
            if attempt < max_retries - 1:
                print(f"[{requestID}] Retrying...")
                await asyncio.sleep(1)
            else:
                print(f"[{requestID}] Max retries exceeded")
                raise e
    
    
if __name__ == "__main__":
    async def main():
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        device = "cuda" if torch.cuda.is_available() else "cpu"
        model = ChatterboxMultilingualTTS.from_pretrained(device=device, cache_dir="model_cache")
        
        text = "Verbatim: Scientific progress often arrives quietly, reshaping daily life not through spectacle but through accumulation—small, precise improvements that compound until the world behaves differently than it did before."
        requestID = "request123"
        voice = "alloy"
        
        audio_bytes, audio_sample = await generate_tts(text, requestID, model, voice)
        audio_tensor = torch.from_numpy(np.frombuffer(audio_bytes, dtype=np.int16)).unsqueeze(0)
        torchaudio.save(f"audio.wav", audio_tensor, audio_sample)
        torchaudio.save(f"genAudio/audio.wav", audio_tensor, audio_sample)
        print(f"Audio saved as audio.wav")

    asyncio.run(main())