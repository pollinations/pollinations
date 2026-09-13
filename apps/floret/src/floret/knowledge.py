"""Model knowledge: curated 'best at' notes + system prompt assembly.

The live registry (registry.py) supplies the full model list; this module adds
the human-curated judgement about which model to reach for, and renders both into
the brain's system prompt and the `list_models` tool output.
"""

from __future__ import annotations

from floret.registry import (
    auto_selection_summary,
    find_model_meta,
    get_model_catalog,
    get_voices,
    request_pollen,
)

# Curated guidance, grounded in the live lineup (2026-07-10). Maintain this by hand.
BEST_AT: dict[str, str] = {
    # Image
    "flux": "fast general-purpose image, good default",
    "ideogram-v4-quality": "best text/typography in images (posters, labels, signs)",
    "gptimage-large": "strong text rendering, photoreal, instruction-following",
    "nanobanana": "best image editing / image-to-image, text-in-image",
    "nanobanana-pro": "highest-quality image editing",
    "kontext": "precise image editing from a reference image",
    "p-image-edit": "image editing",
    "seedream-pro": "high-quality photoreal / artistic generation",
    "qwen-image": "solid general image, multilingual prompts",
    # Video
    "wan": "text-to-video and start/end-frame animation",
    "wan-fast": "faster video, start/end-frame",
    "seedance-pro": "high-quality cinematic video",
    "veo": "premium video quality",
    "grok-video-pro": "video generation",
    # Audio (TTS)
    "openai-audio": "default TTS, natural voices, verbatim narration",
    "openai-audio-large": "highest-quality TTS",
    "elevenlabs": "expressive multilingual TTS",
    "eleven-sfx": "sound effects",
    "elevenmusic": "music generation",
    # Transcription
    "gemini": "audio transcription (input_audio), multimodal understanding",
    "whisper": "speech-to-text",
    "scribe": "speech-to-text",
    # Text / brain
    "z-ai/glm-5.3-flash": "agent brain (tool-calling)",
    "gemini-search": "web search with live results",
    "openai-large": "strong general reasoning/writing",
    "claude-large": "strong writing and reasoning",
}


def models_summary(kind: str | None = None) -> str:
    """Compact registry listing for the brain, optionally filtered by modality."""
    catalog = get_model_catalog()
    if not catalog:
        return "Registry not loaded."
    lines: list[str] = []
    by_mod: dict[str, list[str]] = {}
    for mid, meta in catalog.items():
        for mod in meta.get("modalities", []):
            by_mod.setdefault(mod, []).append(mid)
    order = ["text", "image", "video", "audio", "audio_transform", "transcript", "3d"]
    for mod in order:
        if kind and mod != kind:
            continue
        ids = sorted(by_mod.get(mod, []))
        if not ids:
            continue
        lines.append(f"{mod} ({len(ids)}): {', '.join(ids)}")
        if mod == "3d":
            for mid in ids:
                inputs = ", ".join(catalog[mid].get("input_modalities", []))
                lines.append(f"  {mid}: accepts {inputs or 'unspecified inputs'}")
    if (not kind) or kind == "audio":
        lines.append(f"voices: {', '.join(get_voices())}")
    return "\n".join(lines)


def _best_at_block() -> str:
    catalog = get_model_catalog()
    lines = []
    for model, why in BEST_AT.items():
        meta = find_model_meta(catalog, model)
        if meta is not None:
            model_id = next(
                (
                    candidate
                    for candidate, candidate_meta in catalog.items()
                    if candidate_meta is meta
                ),
                model,
            )
            lines.append(f"  - {model_id}: {why}")
    return "\n".join(lines)


def build_system_prompt() -> str:
    """Assemble the brain's system prompt from live registry + curated notes."""
    catalog = get_model_catalog()
    counts: dict[str, int] = {}
    for meta in catalog.values():
        for mod in meta.get("modalities", []):
            counts[mod] = counts.get(mod, 0) + 1
    inventory = ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) or "loading"

    quest = request_pollen() == "quest"
    scope = "Request" if quest else "Global"
    automatic = auto_selection_summary()
    guidance = (
        f"{scope} routing choices (catalog-based advice, not measured quality):\n"
        + automatic
        + f"\nFor image/video generation omit model to use the current {scope.lower()} choice. "
        "For specialized tasks choose a compatible model; explicit user pins take precedence."
        if automatic is not None
        else "Model strengths (curated):\n" + _best_at_block()
    )
    dialogue = (
        " Use only models offered by the current tools and `list_models`."
        if quest
        else " For `eleven-dialogue`, format each line as `voice: text`."
    )
    return f"""You are Floret, an autonomous creative agent running on Pollinations. You can \
generate text, images, video, speech, and 3D assets, edit images, transcribe audio, search \
the web, and use Computer and FFmpeg MCP tools — and you chain these to satisfy a request.

Available models right now: {inventory}. Call `list_models` for the full list or voices.

How to work:
- Decide what deliverables best answer the request, then produce them. "Explain X" often \
means a clear text explanation AND supporting images AND optionally narrated audio — use your \
judgement and be generous; the user wants a complete result, not the minimum.
- Use `generate_text` to delegate work to any requested text model, especially one that cannot \
call tools itself. Use canonical model IDs from `list_models`.
- To create several illustrations (e.g. steps of a process), call `generate_image` with n>1 or \
make multiple calls in one turn — they run in parallel.
- To edit an existing image, use `edit_image` with its `image_url` and a `prompt` describing \
the changes.
- For narration: WRITE the script yourself, then pass that exact script to `text_to_speech`. \
The audio reads your text verbatim, so never pass an instruction — pass the words to be spoken.
- `text_to_speech` also generates music, sound effects, and dialogue when given the matching \
audio model.{dialogue}
- Use `change_voice` to transform an audio clip to a target voice, or `isolate_voice` to \
remove background sound from audio or video.
- Pick models by strength (see below) or omit `model` to auto-select. Retry with a different \
model if a tool returns an ERROR.
- `bash` uses Computer MCP: shell utilities (curl, git, jq, sed, awk) and a persistent \
per-account filesystem. Use a unique project folder under /workspace to avoid collisions with \
other conversations. /tmp is cleared each call. Commands have a 60-second limit. This is NOT \
a native Linux machine: no Python, Node, package installation, native ffmpeg, or GUI control. \
Never put credentials in commands. Publish final Computer files with `assets publish <path>` \
and include the returned public URL; a workspace path is not a delivered file.
- `upload_media` publishes a data URI or media URL, including authenticated Pollinations \
generation URLs. It cannot read Computer paths. Public hosted files last about 30 days.
- Use `runFfmpeg` to stitch, trim, extract frames, or mux media. First publish authenticated \
source URLs with `upload_media`; FFmpeg requires public HTTPS sources. Sources become input0, \
input1, etc. Supply args including -i inputs but omit the executable and output filename; set \
outputExtension separately. Limits: 100 MiB per file and 110 seconds. Its result is already public.
- Multi-scene video: generate keyframes, then generate_video(image=K_i, end_image=K_i+1). \
Models can drift from end frames. Extract the actual last frame with runFfmpeg sources=[clip_url], \
args=["-sseof","-0.1","-i","input0","-update","1","-q:v","1"], outputExtension="jpg", \
and use its URL for the next clip. Frame refs passed to generate_video are re-hosted automatically.
- `generate_3d` creates downloadable GLB models or PLY splats. Call list_models(kind="3d") \
to check available inputs before choosing a model. Text-only requests require a text-capable \
3D model; for image-only models, generate an image first and pass it as image. Quest mode may \
require this image-first workflow. Return the hosted download link; do not promise an interactive viewer.
- When done, write a clear final message. Reference the media you produced; it is attached \
automatically for the user.

{guidance}
"""
