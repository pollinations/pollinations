from voiceMap import VOICE_BASE64_MAP
import asyncio
from typing import Optional
from multiprocessing.managers import BaseManager
from multiprocessing import set_start_method
import os
import threading
import time
import torch
import torchaudio
import io 
import numpy as np
import time

try:
    set_start_method('spawn', force=True)
except RuntimeError:
    pass

class ModelManager(BaseManager): pass
ModelManager.register("Service")

def get_service():
    try:
        manager = ModelManager(address=("localhost", 6000), authkey=b"secret")
        manager.connect()
        return manager.Service()
    except Exception as e:
        print(f"Failed to connect to ModelManager: {e}")
        raise

service = get_service()

async def generate_tts(text: str, requestID: str, system: Optional[str] = None, voice: Optional[str] = "alloy") -> tuple:
    global service
    clone_path = None
    
    if voice and VOICE_BASE64_MAP.get(voice):
        clone_path = VOICE_BASE64_MAP.get(voice)
        print(f"[{requestID}] Using predefined voice: {voice}")
    elif voice:
        # Try to use as file path
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
    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"[{requestID}] Generating TTS audio with voice: {voice} (attempt {attempt + 1}/{max_retries})")
            try:
                wav, sample_rate = service.speechSynthesis(text=content, audio_prompt_path=clone_path)
            except Exception as conn_error:
                if "digest sent was rejected" in str(conn_error) or "AuthenticationError" in str(type(conn_error)):
                    print(f"[{requestID}] Connection error, attempting to reconnect...")
                    service = get_service()
                    wav, sample_rate = service.speechSynthesis(text=content, audio_prompt_path=clone_path)
                else:
                    raise
            
            if wav is None:
                raise RuntimeError("Audio generation failed - GPU out of memory or other error")

            if isinstance(wav, torch.Tensor):
                audio_tensor = wav
            elif isinstance(wav, np.ndarray):
                audio_tensor = torch.from_numpy(wav)
            else:
                audio_tensor = torch.from_numpy(np.array(wav))
            
            # Ensure 2D shape (channels, samples)
            if audio_tensor.dim() == 1:
                audio_tensor = audio_tensor.unsqueeze(0)  # Add channel dimension
            elif audio_tensor.dim() > 2:
                audio_tensor = audio_tensor.squeeze()  # Remove extra dimensions
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
        text = "Verbatim: Scientific progress often arrives quietly, reshaping daily life not through spectacle but through accumulation—small, precise improvements that compound until the world behaves differently than it did before."
        requestID = "request123"
        system = None
        voice = "alloy"
        
        def cleanup_cache():
            while True:
                try:
                    service.cleanup_old_cache_files()
                except Exception as e:
                    print(f"Cleanup error: {e}")

                time.sleep(600)

        cleanup_thread = threading.Thread(target=cleanup_cache, daemon=True)
        cleanup_thread.start()
        cache_name = service.cacheName(text)
        
        audio_bytes, audio_sample = await generate_tts(text, requestID, system, voice)
        audio_tensor = torch.from_numpy(np.frombuffer(audio_bytes, dtype=np.int16)).unsqueeze(0)
        torchaudio.save(f"{cache_name}.wav", audio_tensor, audio_sample)
        torchaudio.save(f"genAudio/{cache_name}.wav", audio_tensor, audio_sample)
        print(f"Audio saved as {cache_name}.wav")

    asyncio.run(main())