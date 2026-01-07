import torch
import torchaudio
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from loguru import logger
from chatterbox.tts_turbo import ChatterboxTurboTTS
from tts import generate_tts
import asyncio
import io
import numpy as np
import string
from uuid import uuid4
from pydub import AudioSegment
import traceback

device = "cuda" if torch.cuda.is_available() else "cpu"
cache_dir = "model_cache"
if device == "cuda":
    torch.cuda.set_per_process_memory_fraction(0.5, 0)

BASE62 = string.digits + string.ascii_letters

app = Flask(__name__)
CORS(app)

# Load TTS model on startup
logger.info("Loading ChatterboxTurboTTS model...")
tts_model = ChatterboxTurboTTS.from_pretrained(device=device, cache_dir=cache_dir)
logger.info("Model loaded successfully")

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
        instructions = body.get("instructions")
        response_format = body.get("response_format", "wav").lower()
        speed = body.get("speed", 0.5)  
        exaggeration = body.get("exaggeration", 0.0) 
        cfg_weight = body.get("cfg_weight", 7.0)  
        
        if response_format not in ["wav", "mp3", "aac", "flac", "opus", "pcm"]:
            return jsonify({"error": f"Unsupported response_format: {response_format}. Supported: wav, mp3, aac, flac, opus, pcm"}), 400
        
        if not isinstance(speed, (int, float)) or speed < 0.0 or speed > 1.0:
            return jsonify({"error": "Speed must be between 0.0 (slow) and 1.0 (fast). Default: 0.5 (normal)"}), 400
        
        if not isinstance(exaggeration, (int, float)) or exaggeration < 0.0:
            return jsonify({"error": "Exaggeration must be >= 0.0. Use 0.7+ for dramatic speech"}), 400
        
        if not isinstance(cfg_weight, (int, float)) or cfg_weight < 0.1:
            return jsonify({"error": "cfg_weight must be >= 0.1. Lower values (0.3) for more expressive, higher (7.0+) for neutral"}), 400
        
        request_id = str(uuid4())[:12]
        logger.info(f"[{request_id}] TTS request: text={text[:50]}..., voice={voice}, format={response_format}, speed={speed:.2f}, exaggeration={exaggeration:.2f}, cfg_weight={cfg_weight:.2f}")
        
        try:
            audio_bytes, sample_rate = asyncio.run(generate_tts(
                text=text,
                requestID=request_id,
                model=tts_model,
                system=instructions,
                voice=voice,
                speed=speed,
                exaggeration=exaggeration,
                cfg_weight=cfg_weight
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
