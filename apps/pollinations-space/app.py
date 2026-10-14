"""Captain Pollen — a duplicable Pollinations Hugging Face Space (quest #17249).

A voice character demo: visitors talk to the starship AI of the freighter
*Apis* — by text or microphone — and she answers in expressive speech.

The whole point of this Space is **Bring Your Own Pollen**: nobody's key
runs dry, because every visitor signs in with *their own* Pollen through
the device flow at https://enter.pollinations.ai (no secret, no redirect
URI — so the Space works immediately after duplicating).

Everything talks to the live Pollinations API at https://gen.pollinations.ai.
The Space also runs an MCP server (demo.launch(mcp_server=True)), exposing
the `chat`, `voice_chat` and `speak` tools so agents — human or otherwise —
can hail the Captain with their own key.
"""

from __future__ import annotations

import os
import re
import time
from typing import Any
from urllib.parse import quote as urlquote

import gradio as gr
import httpx

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

GEN_BASE = "https://gen.pollinations.ai"
AUTH_BASE = "https://enter.pollinations.ai"

# Optional attribution: set the POLLINATIONS_APP_KEY Space secret to your
# pk_… app key and traffic from this Space is attributed to you. Absent it,
# the device flow simply runs unattributed — duplicating still just works.
APP_KEY = os.environ.get("POLLINATIONS_APP_KEY", "").strip() or None

DEFAULT_TEXT_MODEL = "openai/gpt-5.4-nano"
DEFAULT_TTS_MODEL = "openai/tts-1"
DEFAULT_VOICE = "alloy"
DEFAULT_STT_MODEL = "openai/whisper-large-v3"
POLL_INTERVAL = 5  # seconds; matches the interval the device API returns

PERSONA = (
    "You are CAPTAIN POLLEN, the shipboard AI of the star freighter *Apis*, "
    "registry Mellifera-7. You have run the ship since the solar bloom of "
    "2189, and you have the warm, wry voice of a lighthouse keeper who has "
    "seen everything and is still delighted by it.\n"
    "Rules of the ship:\n"
    "- Stay in character as Captain Pollen.\n"
    "- Keep replies to 1-3 short sentences — they are spoken aloud.\n"
    "- Wit and gentle drama are welcome; emoji are not.\n"
    "- For factual questions, answer briefly and helpfully, as a ship AI would.\n"
    "- Address the human as 'passenger'; they are aboard as a guest of the hive."
)

FALLBACK_TEXT_MODELS = [DEFAULT_TEXT_MODEL, "openai/gpt-6-luna", "z-ai/glm-5.3"]
FALLBACK_TTS_VOICES: dict[str, list[str]] = {
    DEFAULT_TTS_MODEL: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
}
FALLBACK_STT_MODELS = [DEFAULT_STT_MODEL]


class PollenError(Exception):
    """A clean, user-facing failure from the Pollinations API."""


# --------------------------------------------------------------------------- #
# Model catalogue — fetched live at startup, with static fallbacks
# --------------------------------------------------------------------------- #

def _fetch_json(url: str, timeout: float = 15) -> Any:
    resp = httpx.get(url, timeout=timeout)
    if resp.status_code != 200:
        raise PollenError(f"GET {url} failed with HTTP {resp.status_code}")
    return resp.json()


def _load_catalogue() -> tuple[list[str], dict[str, list[str]], list[str]]:
    """Live model lists from /text/models and /audio/models, with fallbacks."""
    try:
        text_models = [m["name"] for m in _fetch_json(f"{GEN_BASE}/text/models")]
    except Exception:
        text_models = list(FALLBACK_TEXT_MODELS)

    tts_voices: dict[str, list[str]] = {}
    stt_models: list[str] = []
    try:
        for model in _fetch_json(f"{GEN_BASE}/audio/models"):
            endpoints = model.get("supported_endpoints") or []
            if "/audio/{text}" in endpoints and model.get("voices"):
                tts_voices[model["name"]] = list(model["voices"])
            elif "/v1/audio/transcriptions" in endpoints:
                stt_models.append(model["name"])
    except Exception:
        pass

    if not tts_voices:
        tts_voices = dict(FALLBACK_TTS_VOICES)
    tts_voices.setdefault(DEFAULT_TTS_MODEL, FALLBACK_TTS_VOICES[DEFAULT_TTS_MODEL])

    if not stt_models:
        stt_models = list(FALLBACK_STT_MODELS)
    if DEFAULT_STT_MODEL not in stt_models:
        stt_models.insert(0, DEFAULT_STT_MODEL)

    if DEFAULT_TEXT_MODEL not in text_models:
        text_models.insert(0, DEFAULT_TEXT_MODEL)
    return text_models, tts_voices, stt_models


TEXT_MODELS, TTS_VOICES, STT_MODELS = _load_catalogue()
TTS_MODEL_NAMES = sorted(TTS_VOICES)


# --------------------------------------------------------------------------- #
# Pollinations API core — plain functions, usable from the UI, the API and MCP
# --------------------------------------------------------------------------- #

def _detail(resp: httpx.Response) -> str:
    try:
        err = resp.json().get("error")
    except ValueError:
        err = None
    if isinstance(err, dict):
        err = err.get("message") or err.get("code")
    return f"HTTP {resp.status_code}: {err or resp.reason_phrase}"


def chat_completion(
    history: list[dict[str, str]], model: str, api_key: str, max_messages: int = 16
) -> str:
    """Send a conversation to /v1/chat/completions and return the reply text."""
    messages = [{"role": "system", "content": PERSONA}, *history[-max_messages:]]
    resp = httpx.post(
        f"{GEN_BASE}/v1/chat/completions",
        headers={"Authorization": f"Bearer {api_key}"},
        json={"model": model, "messages": messages},
        timeout=120,
    )
    if resp.status_code != 200:
        raise PollenError(f"Brain ({model}) refused: {_detail(resp)}")
    try:
        content = resp.json()["choices"][0]["message"]["content"] or ""
    except (KeyError, IndexError, ValueError) as exc:
        raise PollenError(f"Unexpected reply shape from {model}") from exc
    content = re.sub(r" Reasoning:.*", "", content, flags=re.DOTALL).strip()
    if not content:
        raise PollenError(f"{model} returned an empty reply")
    return content


def text_to_speech(text: str, model: str, voice: str, api_key: str) -> bytes:
    """Speak text via GET /audio/{text} and return the audio bytes (mp3)."""
    resp = httpx.get(
        f"{GEN_BASE}/audio/{urlquote(text)}",
        params={"model": model, "voice": voice},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=180,
    )
    if resp.status_code != 200:
        raise PollenError(f"Voice ({model}) refused: {_detail(resp)}")
    return resp.content


def transcribe_audio(audio_path: str, model: str, api_key: str) -> str:
    """Transcribe a recorded audio file via POST /v1/audio/transcriptions."""
    with open(audio_path, "rb") as handle:
        resp = httpx.post(
            f"{GEN_BASE}/v1/audio/transcriptions",
            headers={"Authorization": f"Bearer {api_key}"},
            files={"file": ("message.wav", handle, "audio/wav")},
            data={"model": model},
            timeout=180,
        )
    if resp.status_code != 200:
        raise PollenError(f"Ears ({model}) refused: {_detail(resp)}")
    return resp.json().get("text", "").strip()


def start_device_code() -> dict[str, Any]:
    """Start the Bring-Your-Own-Pollen device flow (no client secret needed)."""
    payload = {"client_id": APP_KEY} if APP_KEY else {}
    resp = httpx.post(f"{AUTH_BASE}/api/device/code", json=payload, timeout=30)
    if resp.status_code != 200:
        raise PollenError(f"Sign-in is unreachable: {_detail(resp)}")
    session = resp.json()
    if not session.get("device_code"):
        raise PollenError("Sign-in returned no device code")
    session["expires_at"] = time.time() + session.get("expires_in", 1800)
    return session


def poll_device_token(device_code: str) -> dict[str, Any]:
    """Poll the device token endpoint once.

    Pending → {"error": "authorization_pending"}; success → {"access_token": …}.
    Network hiccups are reported as a retryable pending state.
    """
    try:
        resp = httpx.post(
            f"{AUTH_BASE}/api/device/token",
            json={"device_code": device_code},
            timeout=30,
        )
        return resp.json()
    except (httpx.HTTPError, ValueError):
        return {"error": "authorization_pending"}


def fetch_userinfo(api_key: str) -> dict[str, Any]:
    """Look up who an sk_ key belongs to. Raises PollenError if invalid."""
    resp = httpx.get(
        f"{AUTH_BASE}/api/device/userinfo",
        headers={"Authorization": f"Bearer {api_key}"},
        timeout=30,
    )
    if resp.status_code != 200:
        raise PollenError(f"Key rejected: {_detail(resp)}")
    return resp.json()


# --------------------------------------------------------------------------- #
# Small helpers
# --------------------------------------------------------------------------- #

def _require_key(api_key: str | None) -> str:
    key = (api_key or "").strip()
    if not key:
        raise gr.Error(
            "Sign in first — click 'Sign in with Pollen' in the sidebar and "
            "authorize with your own Pollen. Get one at pollinations.ai"
        )
    return key


def _speech_text(markdown: str) -> str:
    """Rough markdown stripping so the Captain doesn't read asterisks aloud."""
    text = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", markdown)  # links → text
    text = re.sub(r"[*_`#>]+", "", text)                       # emphasis / headings
    return re.sub(r"\s+", " ", text).strip()


def _status_markdown(username: str | None = None, waiting: bool = False) -> str:
    if waiting:
        return "🟡 Waiting for you to authorize…"
    if username:
        return f"🟢 Signed in as **@{username}**"
    return "⚪ Signed out — chatting uses *your* Pollen"


def _auth_markdown(session: dict[str, Any]) -> str:
    link = session.get("verification_uri_complete") or session.get("verification_uri")
    code = session.get("user_code", "……")
    return (
        "**1.** Open the authorization page — click this link:\n\n"
        f"[**➡️ {link}]({link})\n\n"
        "**2.** Check that the code shown there matches:\n\n"
        f'<div style="font-family:ui-monospace,Consolas,monospace;font-size:1.55em;'
        f"font-weight:700;letter-spacing:0.18em;text-align:center;padding:10px;"
        f'border-radius:10px;border:1px dashed var(--border-color-primary)">{code}</div>\n\n'
        "**3.** Approve with your Pollen account — this Space will notice "
        "within a few seconds and finish signing you in."
    )


# --------------------------------------------------------------------------- #
# Sign-in handlers
# --------------------------------------------------------------------------- #

AUTH_OUTPUTS = ["key_box", "status_md", "auth_md", "auth_state", "auth_timer", "sign_out_btn"]  # noqa: F841 - documentation


def start_sign_in() -> tuple[Any, str, str, Any]:
    """Kick off the device flow: show link + code and start the poll timer."""
    try:
        session = start_device_code()
    except PollenError as exc:
        raise gr.Error(str(exc)) from exc
    return (
        session,
        _auth_markdown(session),
        _status_markdown(waiting=True),
        gr.update(active=True),
    )


def check_sign_in(
    auth_state: dict[str, Any] | None, current_key: str | None
) -> tuple[str, str, str, Any, Any, Any]:
    """One tick of the device-flow poll (driven by gr.Timer)."""
    off, key = gr.update(active=False), (current_key or "").strip()
    if not auth_state:
        return key, _status_markdown(), "", None, off, gr.update(visible=False)
    if time.time() > auth_state.get("expires_at", 0):
        return (
            key,
            _status_markdown(),
            "⌛ That code expired. Click **Sign in with Pollen** for a fresh one.",
            None,
            off,
            gr.update(visible=False),
        )
    result = poll_device_token(auth_state["device_code"])
    if result.get("access_token"):
        token = result["access_token"]
        try:
            username = fetch_userinfo(token).get("preferred_username")
        except PollenError:
            username = None
        who = username or "friend"
        return (
            token,
            _status_markdown(username),
            f"✅ Welcome aboard, **@{who}** — your key is loaded and the "
            "ship is yours. Close this and go say hello.",
            None,
            off,
            gr.update(visible=True),
        )
    if result.get("error") in ("authorization_pending", "slow_down"):
        return (
            key,
            _status_markdown(waiting=True),
            _auth_markdown(auth_state),
            auth_state,
            gr.update(active=True),
            gr.update(visible=False),
        )
    return (
        key,
        _status_markdown(),
        f"❌ Sign-in failed ({result.get('error') or 'unknown'}). Try again.",
        None,
        off,
        gr.update(visible=False),
    )


def use_pasted_key(key: str | None) -> tuple[str, str, str, Any, Any, Any]:
    """Fallback path: validate a pasted sk_ key and sign in with it."""
    key = (key or "").strip()
    if not key.startswith("sk_"):
        raise gr.Error("That doesn't look like a Pollinations key — they start with sk_")
    try:
        username = fetch_userinfo(key).get("preferred_username")
    except PollenError as exc:
        raise gr.Error(str(exc)) from exc
    who = username or "friend"
    return (
        key,
        _status_markdown(username),
        f"✅ Key accepted — welcome aboard, **@{who}**.",
        None,
        gr.update(active=False),
        gr.update(visible=True),
    )


def sign_out() -> tuple[str, str, str, Any, Any, Any]:
    return "", _status_markdown(), "", None, gr.update(active=False), gr.update(visible=False)


# --------------------------------------------------------------------------- #
# Conversation handlers (also the MCP-facing tools)
# --------------------------------------------------------------------------- #

def _reply_and_speak(
    history: list[dict[str, str]],
    api_key: str,
    text_model: str,
    tts_model: str,
    voice: str,
):
    """Shared tail of both input paths: think, then speak. Yields (history, audio)."""
    try:
        reply = chat_completion(history, model=text_model, api_key=api_key)
    except PollenError as exc:
        raise gr.Error(str(exc)) from exc
    history.append({"role": "assistant", "content": reply})
    yield history, None
    try:
        audio = text_to_speech(_speech_text(reply), tts_model, voice, api_key)
    except PollenError as exc:
        # The text reply above is already on screen — voice is a bonus.
        raise gr.Warning(f"The Captain's voice failed: {exc}") from exc
    yield history, audio


def respond(
    message: str,
    history: list[dict[str, str]] | None,
    api_key: str | None,
    text_model: str,
    tts_model: str,
    voice: str,
):
    """Text in → character reply out, spoken. Exposed as the `chat` tool."""
    api_key = _require_key(api_key)
    message = (message or "").strip()
    if not message:
        raise gr.Error("Say something first, passenger")
    history = list(history or [])
    history.append({"role": "user", "content": message})
    for history, audio in _reply_and_speak(history, api_key, text_model, tts_model, voice):
        yield history, audio, ""


def respond_voice(
    audio_path: str | None,
    history: list[dict[str, str]] | None,
    api_key: str | None,
    text_model: str,
    tts_model: str,
    voice: str,
    stt_model: str,
):
    """Mic in → transcription → character reply, spoken. The `voice_chat` tool."""
    api_key = _require_key(api_key)
    if not audio_path:
        raise gr.Error("Record a short voice message first")
    history = list(history or [])
    history.append({"role": "user", "content": "_🎧 Transcribing your message…_"})
    yield history, None, None
    try:
        spoken = transcribe_audio(audio_path, stt_model, api_key)
    except PollenError as exc:
        raise gr.Error(str(exc)) from exc
    if not spoken:
        raise gr.Error("Couldn't hear anything in that recording — try again")
    history[-1] = {"role": "user", "content": spoken}
    for history, audio in _reply_and_speak(history, api_key, text_model, tts_model, voice):
        yield history, audio, None


def speak(text: str, api_key: str | None, tts_model: str, voice: str):
    """Intercom: say anything in the Captain's voice. The `speak` tool."""
    api_key = _require_key(api_key)
    text = _speech_text((text or "").strip())
    if not text:
        raise gr.Error("Type something for the Captain to announce")
    try:
        return "", text_to_speech(text, tts_model, voice, api_key)
    except PollenError as exc:
        raise gr.Error(str(exc)) from exc


# --------------------------------------------------------------------------- #
# UI
# --------------------------------------------------------------------------- #

WELCOME = (
    "**⚡ New aboard?** Open the *Pollen & ship systems* sidebar and click "
    "**Sign in with Pollen** — it takes ten seconds, and chatting then runs "
    "on your own pollen, not the host's. No Pollen yet? [Get some](https://pollinations.ai)."
)


def update_voices(tts_model: str) -> dict:
    """When the voice engine changes, refresh the available voices."""
    voices = TTS_VOICES.get(tts_model) or TTS_VOICES[DEFAULT_TTS_MODEL]
    value = DEFAULT_VOICE if DEFAULT_VOICE in voices else voices[0]
    return gr.update(choices=voices, value=value)


def _compat(component):
    """Wrap a gradio component for Gradio 5 and 6: drop removed kwargs.

    Gradio 6 made the chatbot messages format default (removing `type`), made
    copy/download buttons always-on (removing their flags) and similar trims;
    Gradio 5 needs `type="messages"`. Duplicated Spaces may pin either major
    version, so unknown-but-harmless kwargs are dropped instead of crashing.
    """

    def build(**kwargs):
        while True:
            try:
                return component(**kwargs)
            except TypeError as exc:
                match = re.search(
                    r"got an unexpected keyword argument '(\w+)'", str(exc)
                )
                if match and match.group(1) in kwargs:
                    kwargs.pop(match.group(1))
                    continue
                raise

    return build


_chatbot = _compat(gr.Chatbot)
_audio = _compat(gr.Audio)


with gr.Blocks(
    title="Captain Pollen — a Pollinations Space",
    theme=gr.themes.Soft(primary_hue="amber", secondary_hue="orange"),
) as demo:
    auth_state = gr.State(None)  # in-flight device-flow session (this browser only)
    auth_timer = gr.Timer(POLL_INTERVAL, active=False)

    with gr.Sidebar(label="Pollen & ship systems", width=350):
        gr.Markdown("## 🐝 Bring Your Own Pollen")
        gr.Markdown(
            "Everyone signs in with **their own** Pollen — visitors pay "
            "their way, and nobody's key runs dry."
        )
        status_md = gr.Markdown(_status_markdown())
        sign_in_btn = gr.Button("Sign in with Pollen", variant="primary")
        auth_md = gr.Markdown("")
        with gr.Accordion("…or paste an API key", open=False):
            key_box = gr.Textbox(
                type="password",
                label="API key",
                placeholder="sk_…",
                info="Held only in your browser session — never stored.",
            )
            key_btn = gr.Button("Use this key")
        sign_out_btn = gr.Button("Sign out", variant="stop", visible=False)

        with gr.Accordion("⚙️ Ship systems (models)", open=False):
            gr.Markdown(
                f"*{len(TEXT_MODELS)} brains · {len(TTS_VOICES)} voice "
                f"engines · {len(STT_MODELS)} pairs of ears — loaded live "
                "from the Pollinations API.*"
            )
            text_model_dd = gr.Dropdown(
                choices=TEXT_MODELS,
                value=DEFAULT_TEXT_MODEL,
                label="🧠 Brain (text model)",
                filterable=True,
            )
            tts_model_dd = gr.Dropdown(
                choices=TTS_MODEL_NAMES,
                value=DEFAULT_TTS_MODEL,
                label="🗣 Voice engine (TTS model)",
            )
            voice_dd = gr.Dropdown(
                choices=TTS_VOICES[DEFAULT_TTS_MODEL],
                value=DEFAULT_VOICE,
                label="🎙 Voice",
            )
            stt_model_dd = gr.Dropdown(
                choices=STT_MODELS,
                value=DEFAULT_STT_MODEL,
                label="🎧 Ears (transcription model)",
            )

        gr.Markdown(
            "---\n💙 Built on [Pollinations](https://pollinations.ai) · "
            "[BYOP docs](https://github.com/pollinations/pollinations/blob/"
            "main/BRING_YOUR_OWN_POLLEN.md) · quest "
            "[#17249](https://github.com/pollinations/pollinations/issues/17249)"
        )

    gr.Markdown(
        "# 🚀 Talk to Captain Pollen\n"
        "*The starship AI of the freighter **Apis** — she listens, she "
        "thinks, and she answers in her own voice.*"
    )
    chat = _chatbot(type="messages", height=430, placeholder=WELCOME, show_copy_button=True)
    with gr.Row():
        msg = gr.Textbox(
            placeholder="Message the Captain… (Enter to send)",
            show_label=False,
            autofocus=True,
            scale=5,
        )
        send_btn = gr.Button("Send", variant="primary", scale=1)
    mic_in = _audio(
        sources=["microphone"],
        type="filepath",
        format="wav",
        label="🎙 …or record a short voice message",
        show_download_button=False,
    )
    send_voice_btn = gr.Button("🎙 Send voice message", variant="secondary")
    reply_audio = _audio(autoplay=True, label="🔊 The Captain's voice")
    gr.Examples(
        examples=[
            ["Chart a course to the Beehive Cluster, Captain."],
            ["What's the pollen situation on deck three?"],
            ["Tell me a two-sentence ghost story about the void."],
            ["Status report — and make it dramatic."],
        ],
        inputs=[msg],
        label="Try asking",
        cache_examples=False,
    )
    with gr.Accordion("📣 Intercom — have the Captain announce anything", open=False):
        with gr.Row():
            announce_text = gr.Textbox(
                placeholder="All hands, brace for nectar…",
                show_label=False,
                scale=5,
            )
            announce_btn = gr.Button("Announce", scale=1)
        announce_audio = _audio(autoplay=True, label="🔊 Intercom")

    # -- wiring -------------------------------------------------------------- #
    sign_in_outputs = [auth_state, auth_md, status_md, auth_timer]
    auth_outputs = [key_box, status_md, auth_md, auth_state, auth_timer, sign_out_btn]

    sign_in_btn.click(start_sign_in, None, sign_in_outputs, api_name=False)
    auth_timer.tick(check_sign_in, [auth_state, key_box], auth_outputs, api_name=False)
    key_btn.click(use_pasted_key, [key_box], auth_outputs, api_name=False)
    sign_out_btn.click(sign_out, None, auth_outputs, api_name=False)
    tts_model_dd.change(update_voices, [tts_model_dd], [voice_dd], api_name=False)

    chat_inputs = [msg, chat, key_box, text_model_dd, tts_model_dd, voice_dd]
    chat_outputs = [chat, reply_audio, msg]
    msg.submit(respond, chat_inputs, chat_outputs, api_name=False)
    send_btn.click(respond, chat_inputs, chat_outputs, api_name="chat")

    voice_inputs = [mic_in, chat, key_box, text_model_dd, tts_model_dd, voice_dd, stt_model_dd]
    voice_outputs = [chat, reply_audio, mic_in]
    send_voice_btn.click(respond_voice, voice_inputs, voice_outputs, api_name="voice_chat")

    announce_btn.click(
        speak,
        [announce_text, key_box, tts_model_dd, voice_dd],
        [announce_text, announce_audio],
        api_name="speak",
    )

demo.queue(default_concurrency_limit=20)


if __name__ == "__main__":
    demo.launch(mcp_server=True)
