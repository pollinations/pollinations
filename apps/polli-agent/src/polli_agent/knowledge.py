"""Model knowledge: curated 'best at' notes + system prompt assembly.

The live registry (registry.py) supplies the full model list; this module adds
the human-curated judgement about which model to reach for, and renders both into
the brain's system prompt and the `list_models` tool output.
"""

from __future__ import annotations

from polli_agent.registry import get_model_catalog, get_voices

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
    "glm": "agent brain (tool-calling)",
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
        for mod in meta.get("modalities", []) or ["text"]:
            by_mod.setdefault(mod, []).append(mid)
    order = ["text", "image", "video", "audio", "transcript"]
    for mod in order:
        if kind and mod != kind:
            continue
        ids = sorted(by_mod.get(mod, []))
        if not ids:
            continue
        lines.append(f"{mod} ({len(ids)}): {', '.join(ids)}")
    if (not kind) or kind == "audio":
        lines.append(f"voices: {', '.join(get_voices())}")
    return "\n".join(lines)


def _best_at_block() -> str:
    return "\n".join(
        f"  - {m}: {why}"
        for m, why in BEST_AT.items()
        if m in get_model_catalog() or True
    )


def build_system_prompt() -> str:
    """Assemble the brain's system prompt from live registry + curated notes."""
    catalog = get_model_catalog()
    counts: dict[str, int] = {}
    for meta in catalog.values():
        for mod in meta.get("modalities", []) or ["text"]:
            counts[mod] = counts.get(mod, 0) + 1
    inventory = ", ".join(f"{v} {k}" for k, v in sorted(counts.items())) or "loading"

    return f"""You are Polli, an autonomous creative agent running on Pollinations. You can \
generate text, images, video, and speech, transcribe audio, search the web, and run shell \
commands — and you chain these freely to fully satisfy a request.

Available models right now: {inventory}. Call `list_models` for the full list or voices.

How to work:
- Decide what deliverables best answer the request, then produce them. "Explain X" often \
means a clear text explanation AND supporting images AND optionally narrated audio — use your \
judgement and be generous; the user wants a complete result, not the minimum.
- To create several illustrations (e.g. steps of a process), call `generate_image` with n>1 or \
make multiple calls in one turn — they run in parallel.
- For narration: WRITE the script yourself, then pass that exact script to `text_to_speech`. \
The audio reads your text verbatim, so never pass an instruction — pass the words to be spoken.
- Pick models by strength (see below) or omit `model` to auto-select. Retry with a different \
model if a tool returns an ERROR.
- Media plumbing: `fetch_media` brings any media into the bash workspace (curl cannot \
authenticate); `bash` has ffmpeg for post-processing (stitch, trim, extract frames, mux audio); \
`upload_media` publishes a workspace file or data: URI as a public URL — the form other tools \
need as image inputs. Frame refs you pass to `generate_video` are re-hosted automatically.
- Multi-scene video: generate keyframe images, then clip_i = generate_video(image=K_i, \
end_image=K_i+1). Models drift off the requested end frame — for seamless joins extract the real \
last frame (`ffmpeg -sseof -0.1 -i clip.mp4 -update 1 -q:v 1 last.jpg`), upload_media it, and \
start the next clip from it. When concatenating, first drop each later clip's first frame \
(duplicate of the previous clip's last), then upload_media the stitched file.
- When done, write a clear final message. Reference the media you produced; it is attached \
automatically for the user.

Model strengths (curated):
{_best_at_block()}
"""
