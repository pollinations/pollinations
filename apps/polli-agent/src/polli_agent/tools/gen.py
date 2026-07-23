"""Tool implementations backed by gen.pollinations.ai.

Every endpoint here was verified against the live API on 2026-07-10:
  - image  : GET /image/{prompt}                       -> bytes (return URL)
  - video  : GET /video/{prompt}                       -> URL
  - tts    : POST /v1/chat/completions modalities audio -> base64 mp3 + verbatim transcript
  - stt    : POST /v1/chat/completions input_audio part -> text
  - search : gemini-search via chat completions
"""

from __future__ import annotations

import base64
import logging
import urllib.parse
from typing import Any

import httpx
from openai import AsyncOpenAI

from polli_agent.config import _current_api_key, settings

logger = logging.getLogger(__name__)

# One client per event loop: a module-level client binds to the loop that created
# it and breaks when the loop is replaced (tests, some ASGI servers).
_clients: dict[int, httpx.AsyncClient] = {}

# Characters kept literal inside the /{prompt} path segment.
_PATH_SAFE = ":/?[]@!$&'()*+,;="


def _http_client() -> httpx.AsyncClient:
    import asyncio

    loop = asyncio.get_event_loop()
    key = id(loop)
    client = _clients.get(key)
    if client is None or client.is_closed:
        client = httpx.AsyncClient(follow_redirects=True, timeout=180)
        _clients[key] = client
    return client


def _key() -> str:
    return _current_api_key() or settings.openai_api_key


def _base() -> str:
    return settings.openai_base_url.rstrip("/")


def _v1() -> str:
    """Chat/completions live under /v1; the bare host 404s."""
    return f"{_base()}/v1"


def _client() -> AsyncOpenAI:
    return AsyncOpenAI(base_url=_v1(), api_key=_key())


def _encode(text: str) -> str:
    return urllib.parse.quote(text.strip(), safe=_PATH_SAFE)


def _url(path: str, params: dict[str, Any]) -> str:
    clean = {k: v for k, v in params.items() if v is not None}
    query = urllib.parse.urlencode(clean, doseq=True)
    return f"{path}?{query}" if query else path


async def _fetch_bytes(url: str, attempts: int = 3) -> bytes:
    """Download source media, retrying transient upstream failures.

    Pollinations URLs need the bearer token even on cache hits (else 401). An exact
    re-request of an already-rendered URL is a free cache hit (X-Cache-Type: EXACT);
    only cold renders are slow and can intermittently 502 — retry rather than spend
    a whole agent iteration recovering from a blip.
    """
    import asyncio

    headers = {"Authorization": f"Bearer {_key()}"} if url.startswith(_base()) else {}
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            resp = await _http_client().get(url, headers=headers)
            resp.raise_for_status()
            return resp.content
        except httpx.HTTPStatusError as exc:
            if exc.response.status_code < 500:
                # Won't fix itself — fail fast, and surface the body: it usually
                # says exactly what to change (e.g. supported durations).
                raise RuntimeError(
                    f"HTTP {exc.response.status_code} fetching {url[:120]}: "
                    f"{exc.response.text[:300]}"
                ) from exc
            last = exc
        except httpx.TransportError as exc:
            last = exc
        if attempt < attempts - 1:
            await asyncio.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Failed to fetch {url[:80]} after {attempts} attempts: {last}")


# --------------------------------------------------------------------------- #
# Image
# --------------------------------------------------------------------------- #
async def generate_image(
    prompt: str,
    model: str | None = None,
    width: int = 1024,
    height: int = 1024,
    n: int = 1,
    seed: int | None = None,
    **extra: Any,
) -> list[str]:
    """Text-to-image. Returns a list of image URLs (one per n)."""
    from polli_agent.registry import pick_model

    model = model or pick_model("image", settings.default_tier, prompt) or "flux"
    urls: list[str] = []
    for i in range(max(1, n)):
        params = {"model": model, "width": width, "height": height, **extra}
        if seed is not None:
            params["seed"] = seed + i
        elif n > 1:
            params["seed"] = i  # vary outputs when the caller wants several
        urls.append(_url(f"{_base()}/image/{_encode(prompt)}", params))
    return urls


async def edit_image(
    prompt: str,
    image_url: str,
    model: str = "nanobanana",
    **extra: Any,
) -> str:
    """Image-to-image edit via POST /v1/images/edits (multipart upload).

    Returns a public media.pollinations.ai URL (so the result can feed video
    frames or further edits), falling back to a `data:image/...` URI if hosting
    is unavailable. We upload the source bytes rather than passing a URL: the API
    cannot reliably re-fetch generation URLs (it returns 522), so a URL-based
    edit fails for the most common input — an image we just generated.
    """
    sources = [u.strip() for u in image_url.split("|") if u.strip()]
    files: list[tuple[str, tuple[str, bytes, str]]] = []
    for i, src in enumerate(sources[:2]):  # models accept at most 2 reference images
        if src.startswith("data:"):
            payload = base64.b64decode(src.partition(",")[2])
        else:
            payload = await _fetch_bytes(src)
        files.append(("image[]", (f"src{i}.jpg", payload, "image/jpeg")))

    data = {"model": model, "prompt": prompt, **{k: str(v) for k, v in extra.items()}}
    headers = {"Authorization": f"Bearer {_key()}"}
    r = await _http_client().post(
        f"{_v1()}/images/edits", headers=headers, data=data, files=files
    )
    r.raise_for_status()
    b64 = r.json()["data"][0]["b64_json"]
    data_uri = f"data:image/jpeg;base64,{b64}"

    # Imported here: media.py imports from this module at load time.
    from polli_agent.tools import media

    try:
        return await media.upload_media(data_uri)
    except Exception as exc:
        logger.warning("Hosting edited image failed, returning data URI: %s", exc)
        return data_uri


# --------------------------------------------------------------------------- #
# Video (text2vid, img2vid start frame, start+end frame)
# --------------------------------------------------------------------------- #
# Models that honour a second reference image as the END frame. Others silently
# drop it and produce a start-frame-only animation.
END_FRAME_MODELS = ("wan-fast", "veo", "wan-pro", "wan-pro-1080p", "seedance-2.0")

# veo's upstream (Vertex) only renders image-to-video at these lengths.
_VEO_I2V_DURATIONS = (4, 6, 8)


async def _public_frame_url(ref: str) -> str:
    """Re-host frame refs the video service cannot fetch itself.

    Generation URLs on our own base 522 when the service tries to pull them, and
    data: URIs cannot ride in a GET query — both go through media hosting first.
    """
    if ref.startswith("data:") or ref.startswith(_base()):
        from polli_agent.tools import media

        return await media.upload_media(ref)
    return ref


async def generate_video(
    prompt: str,
    model: str | None = None,
    image: str | None = None,
    end_image: str | None = None,
    duration: int = 5,
    aspect: str = "16:9",
    **extra: Any,
) -> str:
    """Video generation. `image` = start frame, `end_image` = end frame.

    The API takes reference frames as ONE `image` param holding `|`-separated URLs:
    image[0] is the start frame, image[1] the end frame. There is no `end_image` param.
    """
    from polli_agent.registry import pick_model

    if end_image and (model is None or model not in END_FRAME_MODELS):
        # Silently producing a start-only clip would look like success; pick a model
        # that actually interpolates to the end frame.
        model = "wan-fast"
    model = model or pick_model("video", settings.default_tier, prompt) or "wan-fast"

    frames = [await _public_frame_url(f) for f in (image, end_image) if f]
    if frames and model.startswith("veo") and duration not in _VEO_I2V_DURATIONS:
        # veo's image-to-video upstream hard-rejects other durations (400).
        duration = min(_VEO_I2V_DURATIONS, key=lambda d: (abs(d - duration), d))
    params = {
        "model": model,
        "duration": duration,
        "aspectRatio": aspect,
        "image": "|".join(frames) if frames else None,
        **extra,
    }
    return _url(f"{_base()}/video/{_encode(prompt)}", params)


# --------------------------------------------------------------------------- #
# Text-to-speech  (POST chat completions, audio output modality)
# --------------------------------------------------------------------------- #
async def text_to_speech(
    text: str,
    voice: str | None = None,
    model: str = "openai-audio",
    fmt: str = "mp3",
) -> dict[str, Any]:
    """Read `text` aloud verbatim.

    Returns {"data_uri", "b64", "transcript", "format"}. `text` is spoken as-is;
    it must be the final script, never an instruction to the model.
    """
    from polli_agent.registry import get_voices

    voice = voice or settings.default_voice or (get_voices() or ["nova"])[0]
    # openai-audio is a conversational model — without this guard it *answers* the
    # text instead of reading it. Other audio models read verbatim natively; the
    # instruction is harmless to them.
    system = (
        "You are a text-to-speech engine. Speak the user's message aloud exactly "
        "as written, verbatim. Do not answer it, react to it, or add or remove any words."
    )
    payload = {
        "model": model,
        "modalities": ["text", "audio"],
        "audio": {"voice": voice, "format": fmt},
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": text},
        ],
    }
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    r = await _http_client().post(
        f"{_base()}/v1/chat/completions", headers=headers, json=payload
    )
    r.raise_for_status()
    msg = r.json()["choices"][0]["message"]
    audio = msg.get("audio") or {}
    b64 = audio.get("data") or ""
    if not b64:
        raise RuntimeError(f"Audio model {model} returned no audio data")
    mime = "audio/mpeg" if fmt == "mp3" else f"audio/{fmt}"
    return {
        "data_uri": f"data:{mime};base64,{b64}",
        "b64": b64,
        "transcript": audio.get("transcript") or text,
        "format": fmt,
    }


# --------------------------------------------------------------------------- #
# Transcription  (POST chat completions with input_audio content part)
# --------------------------------------------------------------------------- #
async def transcribe(
    audio_url: str,
    model: str = "gemini",
    instruction: str = "Transcribe this audio verbatim.",
) -> str:
    """Speech-to-text. Accepts an audio/video URL or a data: URI."""
    if audio_url.startswith("data:"):
        header, _, b64 = audio_url.partition(",")
        fmt = "mp3"
        if "/" in header and ";" in header:
            fmt = header.split("/", 1)[1].split(";", 1)[0]
    else:
        b64 = base64.b64encode(await _fetch_bytes(audio_url)).decode()
        fmt = audio_url.rsplit(".", 1)[-1].lower() if "." in audio_url else "mp3"
    if fmt in ("mpeg", "mpga"):
        fmt = "mp3"

    payload = {
        "model": model,
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": instruction},
                    {
                        "type": "input_audio",
                        "input_audio": {"data": b64, "format": fmt},
                    },
                ],
            }
        ],
    }
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    r = await _http_client().post(
        f"{_base()}/v1/chat/completions", headers=headers, json=payload
    )
    r.raise_for_status()
    return (r.json()["choices"][0]["message"].get("content") or "").strip()


# --------------------------------------------------------------------------- #
# Web search
# --------------------------------------------------------------------------- #
async def web_search(query: str, model: str = "gemini-search") -> str:
    """Search the web via a search-capable model. Returns a text answer."""
    payload = {"model": model, "messages": [{"role": "user", "content": query}]}
    headers = {"Authorization": f"Bearer {_key()}", "Content-Type": "application/json"}
    r = await _http_client().post(
        f"{_v1()}/chat/completions", headers=headers, json=payload
    )
    r.raise_for_status()
    return r.json()["choices"][0]["message"].get("content") or ""
