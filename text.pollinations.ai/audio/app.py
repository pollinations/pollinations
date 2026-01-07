import torch
import torchaudio
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from loguru import logger
from chatterbox.mtl_tts import ChatterboxMultilingualTTS
from tts import generate_tts
import asyncio
import io
import numpy as np
import string
from uuid import uuid4
from pydub import AudioSegment
import traceback
import base64
import wave
import tempfile
import os

device = "cuda" if torch.cuda.is_available() else "cpu"
cache_dir = "model_cache"
if device == "cuda":
    torch.cuda.set_per_process_memory_fraction(0.5, 0)

BASE62 = string.digits + string.ascii_letters

app = Flask(__name__)
CORS(app)

logger.info("Loading ChatterboxMultilingualTTS model...")
tts_model = ChatterboxMultilingualTTS.from_pretrained(device=device, cache_dir=cache_dir)
logger.info("Multilingual TTS model loaded successfully")


TEMP_AUDIO_DIR = tempfile.mkdtemp(prefix="tts_ref_")
logger.info(f"Temp audio directory: {TEMP_AUDIO_DIR}")

def process_reference_audio(audio_b64: str, requestID: str) -> str:
    try:
        audio_bytes = base64.b64decode(audio_b64)
        logger.info(f"[{requestID}] Decoded reference audio: {len(audio_bytes)} bytes")
    except Exception as e:
        raise ValueError(f"Invalid base64 encoding: {e}")
    
    try:
        wav_buffer = io.BytesIO(audio_bytes)
        with wave.open(wav_buffer, 'rb') as wav_file:
            n_frames = wav_file.getnframes()
            framerate = wav_file.getframerate()
            n_channels = wav_file.getnchannels()
            sample_width = wav_file.getsampwidth()
            
            duration = n_frames / float(framerate)
            logger.info(f"[{requestID}] Reference audio: {duration:.2f}s, {n_channels} ch, {framerate}Hz")
            if duration < 5:
                raise ValueError(f"Reference audio must be at least 5 seconds (got {duration:.2f}s)")
            if duration > 8:
                logger.info(f"[{requestID}] Trimming reference audio from {duration:.2f}s to 8s")
                frames_to_read = int(framerate * 8)
                wav_file.rewind()
                audio_frames = wav_file.readframes(frames_to_read)
            else:
                audio_frames = wav_file.readframes(n_frames)
        
        temp_path = os.path.join(TEMP_AUDIO_DIR, f"ref_{requestID}.wav")
        with wave.open(temp_path, 'wb') as out_wav:
            out_wav.setnchannels(n_channels)
            out_wav.setsampwidth(sample_width)
            out_wav.setframerate(framerate)
            out_wav.writeframes(audio_frames)
        
        logger.info(f"[{requestID}] Reference audio saved: {temp_path}")
        return temp_path
        
    except wave.Error as e:
        raise ValueError(f"Invalid WAV file: {e}")
    except Exception as e:
        raise ValueError(f"Error processing reference audio: {e}")

@app.route("/", methods=["GET"])
def health_check():
    return jsonify({
        "status": "healthy",
        "endpoints": {
            "POST": "/synthesize"
        },
        "message": "TTS API ready! 🎤"
    })

@app.route("/synthesize", methods=["POST"])
def synthesize():
    try:
        body = request.get_json(force=True)
        
        text = body.get("input")
        if not text or not isinstance(text, str) or not text.strip():
            return jsonify({"error": "Missing required 'input' field (text to synthesize)"}), 400
        
        voice = body.get("voice", "alloy")
        language_id = body.get("language_id", "en")
        instructions = body.get("instructions")
        response_format = body.get("response_format", "wav").lower()
        speed = body.get("speed", 0.5)  
        exaggeration = body.get("exaggeration", 0.0)
        cfg_weight = body.get("cfg_weight", 7.0)
        normalize = body.get("normalize", False)
        reference_audio_b64 = body.get("reference_audio")  # Base64 encoded WAV
        
        # Create request ID early for reference audio processing
        request_id = str(uuid4())[:12]
        
        # Process reference audio if provided
        reference_audio_path = None
        if reference_audio_b64:
            try:
                reference_audio_path = process_reference_audio(reference_audio_b64, request_id)
            except ValueError as e:
                return jsonify({"error": f"Invalid reference audio: {str(e)}"}), 400
        
        # Use reference audio as voice if provided, otherwise use voice parameter
        if reference_audio_path:
            voice = reference_audio_path
        
        supported_languages = ["ar", "da", "de", "el", "en", "es", "fi", "fr", "he", "hi", "it", "ja", "ko", "ms", "nl", "no", "pl", "pt", "ru", "sv", "sw", "tr", "zh"]
        if language_id not in supported_languages:
            return jsonify({"error": f"Unsupported language_id: {language_id}. Supported: {', '.join(supported_languages)}"}), 400
        if response_format not in ["wav", "mp3", "aac", "flac", "opus", "pcm"]:
            return jsonify({"error": f"Unsupported response_format: {response_format}. Supported: wav, mp3, aac, flac, opus, pcm"}), 400
        
        if not isinstance(speed, (int, float)) or speed < 0.0 or speed > 1.0:
            return jsonify({"error": "Speed must be between 0.0 (slow) and 1.0 (fast). Default: 0.5 (normal)"}), 400
        
        if not isinstance(exaggeration, (int, float)) or exaggeration < 0.0:
            return jsonify({"error": "Exaggeration must be >= 0.0. Use 0.7+ for dramatic speech"}), 400
        
        if not isinstance(cfg_weight, (int, float)) or cfg_weight < 0.1:
            return jsonify({"error": "cfg_weight must be >= 0.1. Lower values (0.3) for more expressive, higher (7.0+) for neutral"}), 400
        
        logger.info(f"[{request_id}] TTS request: text={text[:50]}..., language={language_id}, voice={'reference_audio' if reference_audio_path else voice}, format={response_format}, normalize={normalize}")
        
        try:
            audio_bytes, sample_rate = asyncio.run(generate_tts(
                text=text,
                requestID=request_id,
                model=tts_model,
                language_id=language_id,
                system=instructions,
                voice=voice,
                speed=speed,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight,
                normalize=normalize
            ))
        except Exception as e:
            logger.error(f"[{request_id}] Synthesis error: {e}")
            return jsonify({
                "error": f"Audio synthesis failed: {str(e)}"
            }), 503
        
        if audio_bytes is None:
            return jsonify({"error": "Audio generation failed - GPU out of memory"}), 503
        
        if speed != 0.5:  
            speed_factor = 0.5 + speed  
            logger.info(f"[{request_id}] Adjusting speed: normalized {speed:.2f} -> factor {speed_factor:.2f}x")
            audio_tensor = torch.from_numpy(np.frombuffer(audio_bytes, dtype=np.int16)).unsqueeze(0).float()
            new_sample_rate = int(sample_rate * speed_factor)
            resampler = torchaudio.transforms.Resample(sample_rate, new_sample_rate)
            audio_resampled = resampler(audio_tensor)
            buffer = io.BytesIO()
            torchaudio.save(buffer, audio_resampled, new_sample_rate, format="wav")
            audio_bytes = buffer.getvalue()
            sample_rate = new_sample_rate
        
        if response_format != "wav":
            logger.info(f"[{request_id}] Converting to {response_format}")
            audio = AudioSegment.from_wav(io.BytesIO(audio_bytes))
            buffer = io.BytesIO()
            
            format_config = {
                "mp3": {"format": "mp3", "bitrate": "192k"},
                "aac": {"format": "adts", "bitrate": "128k"},
                "flac": {"format": "flac"},
                "opus": {"format": "opus", "bitrate": "128k"},
                "pcm": {"format": "s16"}
            }
            
            config = format_config.get(response_format, {"format": response_format})
            audio.export(buffer, format=config.get("format", response_format))
            audio_bytes = buffer.getvalue()
        
        logger.info(f"[{request_id}] Audio generated: {len(audio_bytes)} bytes")
        
        mime_types = {
            "wav": "audio/wav",
            "mp3": "audio/mpeg",
            "aac": "audio/aac",
            "flac": "audio/flac",
            "opus": "audio/opus",
            "pcm": "audio/pcm"
        }
        
        return Response(
            audio_bytes,
            mimetype=mime_types.get(response_format, "audio/wav"),
            headers={
                "Content-Disposition": f"inline; filename={request_id}.{response_format}",
                "Content-Length": str(len(audio_bytes)),
                "X-Request-ID": request_id
            }
        )
    
    except Exception as e:
        logger.error(f"TTS error: {traceback.format_exc()}")
        return jsonify({"error": str(e)}), 500

@app.route("/health", methods=["GET"])
def health():
    return jsonify({"status": "healthy"}), 200

if __name__ == "__main__":
    logger.info("Starting TTS API server on 0.0.0.0:8001")
    app.run(host="0.0.0.0", port=8001, debug=False)
