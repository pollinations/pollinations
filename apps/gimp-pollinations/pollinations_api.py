#!/usr/bin/env python3
"""Small standard-library Pollinations client used by the GIMP 3 plug-in."""
from __future__ import annotations

import base64
import json
import os
import socket
import tempfile
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any

ENTER_BASE = "https://enter.pollinations.ai"
GEN_BASE = "https://gen.pollinations.ai"
USER_AGENT = "pollinations-gimp/1.2"
MODEL_STATUS_URL = f"{GEN_BASE}/v1/models/status"
# Official anonymous Tinybird read token published in Pollinations API docs.
PUBLIC_MODEL_STATS_URL = (
    "https://api.europe-west2.gcp.tinybird.co/v0/pipes/public_model_stats.json"
    "?limit=500&token=p.eyJ1IjogImFjYTYzZjc5LThjNTYtNDhlNC05NWJjLWEyYmFjMTY0NmJkMyIsICJpZCI6ICI5ZWZmMGM3Ni1kOTZkLTQwYjgtYWQwOC1mNDFlMmRiYjBmYTIiLCAiaG9zdCI6ICJnY3AtZXVyb3BlLXdlc3QyIn0.6VnVkAQ5h_fkcDZVDUoU38dzTxaw0xo3DnmKkhECbA8"
)
CLEARBACKDROP_BASE = "https://clearbackdrop.com"


class PollinationsError(RuntimeError):
    def __init__(self, kind: str, message: str, status: int | None = None):
        super().__init__(message)
        self.kind = kind
        self.status = status

    @property
    def recovery(self) -> str:
        return {
            "auth": "Reconnect your Pollinations account and try again.",
            "payment": "Choose a cheaper model, complete a Quest, or top up Pollen.",
            "rate_limit": "Wait a moment and retry the same request.",
            "bad_request": "Check the model and options, then try again.",
            "network": "Check your connection and retry.",
            "upstream": "Pollinations or its model provider is temporarily unavailable. Retry shortly.",
            "model_timeout": "The model provider timed out upstream (for example HTTP 524). Retry the same request or use the configured fallback model.",
            "timeout": "The client wait timed out. The upstream request may still complete; avoid blindly resubmitting paid work.",
            "rmbg": "Background removal failed. Retry later or disable the RMBG provider in Settings.",
        }.get(self.kind, "Try again. If it persists, reconnect Pollinations.")


@dataclass
class DeviceSession:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    interval: int
    expires_in: int


@dataclass(frozen=True)
class ImageModel:
    name: str
    title: str
    description: str
    input_modalities: tuple[str, ...]
    output_modalities: tuple[str, ...]
    resolutions: tuple[str, ...]
    paid_only: bool
    pricing: dict[str, Any]
    max_reference_images: int | None
    community: bool = False
    supported_endpoints: tuple[str, ...] = ()
    brand: str = ""
    per_user_rpm: int | None = None
    flat_rate: bool = False
    capabilities: tuple[str, ...] = ()
    pricing_variants: tuple[dict[str, Any], ...] = ()

    @property
    def supports_edit(self) -> bool:
        return "image" in self.input_modalities and (not self.supported_endpoints or "/v1/images/edits" in self.supported_endpoints)

    @property
    def supports_quality(self) -> bool:
        # Native Pollinations schema currently advertises quality for these families.
        return (
            self.name.startswith("gptimage")
            or self.name == "gpt-image-2"
            or self.name == "grok-imagine-image-2.0"
            or "quality" in self.capabilities
        )

    @property
    def supports_seed(self) -> bool:
        # Prefer live capability metadata when present; retain the documented
        # native image-model set as a compatibility patch for sparse catalogs.
        if "seed" in self.capabilities:
            return True
        name = self.name.lower()
        return (
            name in {"flux", "zimage", "klein"}
            or name.startswith("seedream")
        )

    @property
    def supports_transparency(self) -> bool:
        # Current Pollinations image schema explicitly supports this on the
        # gptimage family; gpt-image-2 currently rejects transparent=true.
        return self.name in {"gptimage", "gptimage-large"}

    @property
    def estimated_cost(self) -> float | None:
        # A per-generation approximation is only truthful for flat-rate models.
        if not self.flat_rate:
            return None
        try:
            return float(self.pricing.get("completionImageTokens"))
        except (TypeError, ValueError):
            return None

    @property
    def access_label(self) -> str:
        return "paid" if self.paid_only else "quest"

    @property
    def label(self) -> str:
        tags = []
        if self.supports_edit:
            tags.append("edit")
        if self.community:
            tags.append("community")
        if self.paid_only:
            tags.append("paid")
        suffix = f" [{', '.join(tags)}]" if tags else ""
        return f"{self.title or self.name} — {self.name}{suffix}"


@dataclass(frozen=True)
class AdvisorModel:
    id: str
    input_modalities: tuple[str, ...]
    output_modalities: tuple[str, ...]
    tools: bool
    reasoning: bool
    pricing: dict[str, Any]
    owned_by: str = ""
    paid_only: bool = False

    @property
    def label(self) -> str:
        tags = ["vision", "tools"]
        if self.reasoning:
            tags.append("reasoning")
        return f"{self.id} [{', '.join(tags)}]"


@dataclass(frozen=True)
class ModelHealth:
    name: str
    status: str
    total_requests: int
    status_2xx: int
    errors_5xx: int
    error_rate_pct: float
    latency_p50_ms: float | None
    latency_p95_ms: float | None
    avg_latency_ms: float | None
    provider: str = ""
    low_sample: bool = False
    last_error_at: str = ""


@dataclass(frozen=True)
class ModelStats:
    name: str
    request_count: int
    success_count: int
    error_count: int
    avg_cost_pollen: float | None
    avg_response_ms: float | None


@dataclass(frozen=True)
class RmbgResult:
    data: bytes
    limit: int | None = None
    remaining: int | None = None
    reset_seconds: int | None = None
    cached: bool = False
    provider: str = ""


@dataclass(frozen=True)
class GeneratedImage:
    data: bytes
    media_type: str
    revised_prompt: str | None = None

    @property
    def suffix(self) -> str:
        return {
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
            "image/svg+xml": ".svg",
        }.get(self.media_type, ".png")


def _kind_for_status(status: int) -> str:
    if status == 402:
        return "payment"
    if status in (401, 403):
        return "auth"
    if status == 429:
        return "rate_limit"
    if status in (522, 524, 504):
        return "model_timeout"
    if status in (400, 404, 422):
        return "bad_request"
    if status >= 500:
        return "upstream"
    return "unknown"


def _safe_error_message(body: bytes, status: int) -> str:
    try:
        parsed = json.loads(body.decode("utf-8", "replace"))
    except Exception:
        return f"HTTP {status}"
    if isinstance(parsed, dict):
        if isinstance(parsed.get("error"), dict):
            return str(parsed["error"].get("message") or f"HTTP {status}")[:300]
        if isinstance(parsed.get("error"), str):
            return str(parsed.get("error_description") or parsed["error"])[:300]
        if isinstance(parsed.get("message"), str):
            return parsed["message"][:300]
        if isinstance(parsed.get("code"), str):
            return parsed["code"][:100]
    return f"HTTP {status}"


def _request_json(
    url: str,
    *,
    method: str = "GET",
    token: str | None = None,
    body: dict[str, Any] | None = None,
    timeout: int = 30,
) -> Any:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    data = None
    if token:
        headers["Authorization"] = f"Bearer {token}"
    if body is not None:
        data = json.dumps(body).encode()
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as exc:
        payload = exc.read(16384)
        raise PollinationsError(
            _kind_for_status(exc.code), _safe_error_message(payload, exc.code), exc.code
        ) from None
    except (TimeoutError, socket.timeout) as exc:
        raise PollinationsError("timeout", "Pollinations request timed out") from exc
    except urllib.error.URLError as exc:
        raise PollinationsError("network", "Could not reach Pollinations") from exc


def start_device_flow(app_key: str) -> DeviceSession:
    if not app_key.startswith("pk_"):
        raise PollinationsError("config", "A Pollinations publishable App Key is required")
    raw = _request_json(
        f"{ENTER_BASE}/api/device/code",
        method="POST",
        body={"client_id": app_key, "scope": "generate profile usage"},
        timeout=15,
    )
    if not raw.get("device_code") or not raw.get("user_code"):
        raise PollinationsError("upstream", "Device authorization returned no code")
    verification_uri = raw.get("verification_uri") or f"{ENTER_BASE}/device"
    if verification_uri.startswith("/"):
        verification_uri = ENTER_BASE + verification_uri
    complete = raw.get("verification_uri_complete") or (
        f"{verification_uri}?user_code={raw['user_code']}"
    )
    if complete.startswith("/"):
        complete = ENTER_BASE + complete
    return DeviceSession(
        device_code=raw["device_code"],
        user_code=raw["user_code"],
        verification_uri=verification_uri,
        verification_uri_complete=complete,
        interval=max(5, int(raw.get("interval") or 5)),
        expires_in=max(30, int(raw.get("expires_in") or 900)),
    )


def poll_device_token(session: DeviceSession) -> str | None:
    try:
        raw = _request_json(
            f"{ENTER_BASE}/api/device/token",
            method="POST",
            body={"device_code": session.device_code},
            timeout=15,
        )
    except PollinationsError as exc:
        # The legacy-compatible device endpoint normally returns pending as JSON,
        # but tolerate OAuth-style 4xx envelopes too.
        if "slow_down" in str(exc):
            session.interval += 5
            return None
        if "authorization_pending" in str(exc):
            return None
        raise
    if raw.get("access_token"):
        return str(raw["access_token"])
    if raw.get("error") == "slow_down":
        session.interval += 5
        return None
    if raw.get("error") == "authorization_pending":
        return None
    if raw.get("error"):
        raise PollinationsError("auth", str(raw.get("error_description") or raw["error"]))
    return None


class TokenStore:
    def __init__(self, path: str | os.PathLike[str]):
        self.path = Path(path)

    def load(self) -> str | None:
        try:
            data = json.loads(self.path.read_text())
            token = data.get("access_token") if isinstance(data, dict) else None
            return token if isinstance(token, str) and token.startswith("sk_") else None
        except (OSError, ValueError, TypeError):
            return None

    def save(self, token: str) -> None:
        if not token.startswith("sk_"):
            raise PollinationsError("auth", "Pollinations returned an invalid authorization")
        self.path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        os.chmod(self.path.parent, 0o700)
        fd, temp_path = tempfile.mkstemp(prefix=".token-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w") as handle:
                json.dump({"access_token": token}, handle)
                handle.flush()
                os.fsync(handle.fileno())
            os.chmod(temp_path, 0o600)
            os.replace(temp_path, self.path)
            os.chmod(self.path, 0o600)
        finally:
            try:
                os.unlink(temp_path)
            except FileNotFoundError:
                pass

    def clear(self) -> bool:
        try:
            self.path.unlink()
            return True
        except FileNotFoundError:
            return False


def parse_image_models(raw: Any) -> list[ImageModel]:
    items = raw if isinstance(raw, list) else raw.get("data", []) if isinstance(raw, dict) else []
    models: list[ImageModel] = []
    seen: set[str] = set()
    for item in items:
        if not isinstance(item, dict):
            continue
        name = item.get("name") or item.get("id")
        outputs = tuple(item.get("output_modalities") or [])
        if not name or "image" not in outputs or "video" in outputs or name in seen:
            continue
        seen.add(str(name))
        inputs = tuple(item.get("input_modalities") or ["text"])
        resolutions = tuple(str(x) for x in (item.get("resolutions") or []))
        max_refs = item.get("max_reference_images")
        models.append(
            ImageModel(
                name=str(name),
                title=str(item.get("title") or name),
                description=str(item.get("description") or ""),
                input_modalities=inputs,
                output_modalities=outputs,
                resolutions=resolutions,
                paid_only=item.get("paid_only") is True,
                pricing=dict(item.get("pricing") or {}),
                max_reference_images=int(max_refs) if isinstance(max_refs, (int, float)) else None,
                community=bool(item.get("community") or "/" in str(name)),
                supported_endpoints=tuple(str(x) for x in (item.get("supported_endpoints") or [])),
                brand=str(item.get("brand") or ""),
                per_user_rpm=int(item.get("per_user_rpm")) if isinstance(item.get("per_user_rpm"), (int, float)) else None,
                flat_rate=item.get("flat_rate") is True,
                capabilities=tuple(str(x) for x in (item.get("capabilities") or [])),
                pricing_variants=tuple(dict(x) for x in (item.get("pricing_variants") or []) if isinstance(x, dict)),
            )
        )
    return models


def fetch_image_models(token: str) -> list[ImageModel]:
    return parse_image_models(
        _request_json(f"{GEN_BASE}/image/models", token=token, timeout=30)
    )


def _decode_image_response(raw: Any) -> GeneratedImage:
    if not isinstance(raw, dict) or not raw.get("data"):
        raise PollinationsError("upstream", "Pollinations returned no image")
    item = raw["data"][0]
    encoded = item.get("b64_json") if isinstance(item, dict) else None
    if not encoded:
        raise PollinationsError("upstream", "Pollinations returned no image bytes")
    try:
        data = base64.b64decode(encoded, validate=True)
    except Exception as exc:
        raise PollinationsError("upstream", "Pollinations returned invalid image data") from exc
    media_type = str(item.get("media_type") or _sniff_media_type(data))
    return GeneratedImage(data, media_type, item.get("revised_prompt"))


def _sniff_media_type(data: bytes) -> str:
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "image/webp"
    if data.startswith(b"GIF8"):
        return "image/gif"
    if data.lstrip().startswith(b"<svg") or b"<svg" in data[:512].lower():
        return "image/svg+xml"
    return "image/png"


def fetch_advisor_models(token: str) -> list[AdvisorModel]:
    raw = _request_json(f"{GEN_BASE}/v1/models", token=token, timeout=30)
    items = raw if isinstance(raw, list) else raw.get("data", []) if isinstance(raw, dict) else []
    models: list[AdvisorModel] = []
    for item in items:
        if not isinstance(item, dict):
            continue
        model_id = item.get("id") or item.get("name")
        inputs = tuple(item.get("input_modalities") or [])
        outputs = tuple(item.get("output_modalities") or [])
        if not model_id or "image" not in inputs or "text" not in outputs or item.get("tools") is not True:
            continue
        models.append(
            AdvisorModel(
                id=str(model_id),
                input_modalities=inputs,
                output_modalities=outputs,
                tools=True,
                reasoning=item.get("reasoning") is True,
                pricing=dict(item.get("pricing") or {}),
                owned_by=str(item.get("owned_by") or ""),
                paid_only=item.get("paid_only") is True,
            )
        )
    return models


def review_prompt(
    token: str,
    advisor_model: str,
    *,
    prompt: str,
    task: str,
    candidate_models: list[ImageModel],
    language: str = "en",
    image_bytes: bytes | None = None,
    context: dict[str, Any] | None = None,
    cost_estimates: dict[str, float] | None = None,
) -> dict[str, Any]:
    candidates = [
        {
            "name": model.name,
            "description": model.description,
            "edit": model.supports_edit,
            "resolutions": list(model.resolutions),
            "community": model.community,
            "paid_only": model.paid_only,
            "max_reference_images": model.max_reference_images,
            "estimated_cost": model.estimated_cost if model.estimated_cost is not None else (cost_estimates or {}).get(model.name),
        }
        for model in candidate_models[:16]
    ]
    system = (
        "You are the lightweight model advisor inside a GIMP image-editing plug-in. "
        "Review the user's intent and current image context. Choose only from the supplied image models. "
        "You are advisory only: the UI requires explicit user acceptance before any suggested prompt, model, or operation is applied. "
        "Return a JSON object only with keys: prompt, operation, image_model, reason, warning. "
        "operation must be one of generation, full_edit, selection_patch, add, replace, remove, separate. "
        "The prompt field is an improved execution prompt, not an explanation. Keep the user's creative intent. "
        f"Write reason and warning in language code {language}."
    )
    user_text = json.dumps(
        {
            "task": task,
            "user_prompt": prompt,
            "context": context or {},
            "image_models": candidates,
        },
        ensure_ascii=False,
    )
    content: list[dict[str, Any]] = [{"type": "text", "text": user_text}]
    if image_bytes:
        encoded = base64.b64encode(image_bytes).decode("ascii")
        content.append({"type": "image_url", "image_url": {"url": f"data:image/png;base64,{encoded}", "detail": "low"}})
    body = {
        "model": advisor_model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content},
        ],
        "response_format": {"type": "json_object"},
        "temperature": 0.2,
        "max_tokens": 700,
    }
    raw = _request_json(
        f"{GEN_BASE}/v1/chat/completions",
        method="POST",
        token=token,
        body=body,
        timeout=120,
    )
    try:
        message = raw["choices"][0]["message"]["content"]
        if isinstance(message, list):
            message = "".join(str(part.get("text") or "") for part in message if isinstance(part, dict))
        parsed = json.loads(str(message))
        if not isinstance(parsed, dict):
            raise ValueError("advisor did not return an object")
    except Exception as exc:
        raise PollinationsError("upstream", "Advisor returned an invalid structured response") from exc
    allowed = {m.name for m in candidate_models}
    if parsed.get("image_model") not in allowed:
        parsed["image_model"] = candidate_models[0].name if candidate_models else ""
    if parsed.get("operation") not in {"generation", "full_edit", "selection_patch", "add", "replace", "remove", "separate"}:
        parsed["operation"] = task
    parsed["prompt"] = str(parsed.get("prompt") or prompt).strip()
    parsed["reason"] = str(parsed.get("reason") or "").strip()
    parsed["warning"] = str(parsed.get("warning") or "").strip()
    return parsed


def generate_image(
    token: str,
    model: ImageModel,
    prompt: str,
    *,
    size: str | None = None,
    width: int | None = None,
    height: int | None = None,
    resolution: str | None = None,
    seed: int | None = None,
    quality: str | None = None,
    transparent: bool = False,
) -> GeneratedImage:
    body: dict[str, Any] = {
        "model": model.name,
        "prompt": prompt,
        "n": 1,
        "response_format": "b64_json",
    }
    if width is not None and height is not None:
        width = max(256, min(4096, int(width)))
        height = max(256, min(4096, int(height)))
        body["size"] = f"{width}x{height}"
    elif size:
        body["size"] = size
    if resolution and resolution in model.resolutions:
        body["resolution"] = resolution
    if seed is not None:
        body["seed"] = int(seed)
    if quality and model.supports_quality:
        body["quality"] = quality
    if transparent and model.supports_transparency:
        body["transparent"] = True
    return _decode_image_response(
        _request_json(
            f"{GEN_BASE}/v1/images/generations",
            method="POST",
            token=token,
            body=body,
            timeout=600,
        )
    )


def edit_image(
    token: str,
    model: ImageModel,
    prompt: str,
    source: bytes,
    *,
    size: str | None = None,
    resolution: str | None = None,
    seed: int | None = None,
    quality: str | None = None,
    transparent: bool = False,
) -> GeneratedImage:
    if not model.supports_edit:
        raise PollinationsError("bad_request", f"{model.name} does not accept image input")
    body: dict[str, Any] = {
        "model": model.name,
        "prompt": prompt,
        "image": f"data:image/png;base64,{base64.b64encode(source).decode()}",
        "n": 1,
    }
    if size:
        body["size"] = size
    if resolution and resolution in model.resolutions:
        body["resolution"] = resolution
    if seed is not None:
        body["seed"] = int(seed)
    if quality and model.supports_quality:
        body["quality"] = quality
    if transparent and model.supports_transparency:
        body["transparent"] = True
    return _decode_image_response(
        _request_json(
            f"{GEN_BASE}/v1/images/edits",
            method="POST",
            token=token,
            body=body,
            timeout=600,
        )
    )


def _health_status(status_2xx: int, errors_5xx: int) -> tuple[str, float]:
    # Exact thresholds used by model-monitor.pollinations.ai as of 2026-09-03.
    total = int(status_2xx or 0) + int(errors_5xx or 0)
    if total <= 0:
        return "on", 0.0
    rate = float(errors_5xx or 0) / total * 100.0
    return ("off" if rate >= 20.0 else "degraded" if rate >= 5.0 else "on"), rate


def fetch_model_health(minutes: int = 60) -> dict[str, ModelHealth]:
    minutes = max(5, min(10080, int(minutes)))
    raw = _request_json(f"{MODEL_STATUS_URL}?minutes={minutes}", timeout=30)
    rows = raw.get("data", []) if isinstance(raw, dict) else []
    grouped: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("model"):
            continue
        grouped.setdefault(str(row["model"]), []).append(row)
    result: dict[str, ModelHealth] = {}
    for name, items in grouped.items():
        ok = sum(int(x.get("status_2xx") or 0) for x in items)
        err5 = sum(int(x.get("errors_5xx") or 0) for x in items)
        requests = sum(int(x.get("total_requests") or 0) for x in items)
        status, rate = _health_status(ok, err5)
        weights = [max(1, int(x.get("total_requests") or 0)) for x in items]
        def weighted(field: str) -> float | None:
            pairs = [(x.get(field), w) for x, w in zip(items, weights) if isinstance(x.get(field), (int, float))]
            if not pairs:
                return None
            total_w = sum(w for _, w in pairs)
            return sum(float(v) * w for v, w in pairs) / total_w
        # p95 is safety-oriented: use the worst provider path instead of averaging it away.
        p95s = [float(x["latency_p95_ms"]) for x in items if isinstance(x.get("latency_p95_ms"), (int, float))]
        providers = sorted({str(x.get("provider") or "") for x in items if x.get("provider")})
        last_errors = sorted(str(x.get("last_error_at") or "") for x in items if x.get("last_error_at"))
        result[name] = ModelHealth(
            name=name,
            status=status,
            total_requests=requests,
            status_2xx=ok,
            errors_5xx=err5,
            error_rate_pct=rate,
            latency_p50_ms=weighted("latency_p50_ms"),
            latency_p95_ms=max(p95s) if p95s else None,
            avg_latency_ms=weighted("avg_latency_ms"),
            provider=", ".join(providers),
            low_sample=requests < 10,
            last_error_at=last_errors[-1] if last_errors else "",
        )
    return result


def fetch_public_model_stats() -> dict[str, ModelStats]:
    """Recent observed model cost/performance from Pollinations public stats.

    The public API reports cost in USD; Pollinations documents ~1 USD = 1 Pollen,
    so the UI labels this as an observed estimate rather than a contractual price.
    """
    raw = _request_json(PUBLIC_MODEL_STATS_URL, timeout=30)
    rows = raw.get("data", []) if isinstance(raw, dict) else []
    out: dict[str, ModelStats] = {}
    for row in rows:
        if not isinstance(row, dict) or not row.get("model"):
            continue
        name = str(row["model"])
        def num(key):
            value = row.get(key)
            return float(value) if isinstance(value, (int, float)) else None
        out[name] = ModelStats(
            name=name,
            request_count=int(row.get("request_count") or 0),
            success_count=int(row.get("success_count") or 0),
            error_count=int(row.get("error_count") or 0),
            avg_cost_pollen=num("avg_cost_usd"),
            avg_response_ms=num("avg_response_ms"),
        )
    return out


def fetch_account_profile(token: str) -> dict[str, Any]:
    raw = _request_json(f"{GEN_BASE}/account/profile", token=token, timeout=20)
    return raw if isinstance(raw, dict) else {}


def fetch_key_info(token: str) -> dict[str, Any]:
    raw = _request_json(f"{GEN_BASE}/account/key", token=token, timeout=20)
    return raw if isinstance(raw, dict) else {}


def fetch_account_balance(token: str) -> dict[str, Any]:
    raw = _request_json(f"{GEN_BASE}/account/balance", token=token, timeout=20)
    return raw if isinstance(raw, dict) else {}


def fetch_key_usage(token: str, limit: int = 30) -> list[dict[str, Any]]:
    raw = _request_json(f"{GEN_BASE}/account/key/usage?limit={max(1,min(100,int(limit)))}", token=token, timeout=20)
    if isinstance(raw, list):
        return [x for x in raw if isinstance(x, dict)]
    if isinstance(raw, dict):
        for key in ("data", "usage", "items"):
            if isinstance(raw.get(key), list):
                return [x for x in raw[key] if isinstance(x, dict)]
    return []


def clearbackdrop_quota() -> dict[str, int | None]:
    req = urllib.request.Request(
        f"{CLEARBACKDROP_BASE}/api/v1/quota",
        headers={"User-Agent": USER_AGENT, "Accept": "application/json"},
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            raw = json.load(response)
            return {
                "limit": int(raw.get("limit_per_hour")) if isinstance(raw.get("limit_per_hour"), (int, float)) else None,
                "remaining": int(raw.get("remaining")) if isinstance(raw.get("remaining"), (int, float)) else None,
                "reset_seconds": int(response.headers.get("X-RateLimit-Reset")) if str(response.headers.get("X-RateLimit-Reset") or "").isdigit() else None,
            }
    except Exception as exc:
        raise PollinationsError("rmbg", "Could not read ClearBackdrop quota") from exc


def remove_background_clearbackdrop(source: bytes, filename: str = "image.png") -> RmbgResult:
    if len(source) > 15 * 1024 * 1024:
        raise PollinationsError("bad_request", "ClearBackdrop accepts images up to 15 MB")
    boundary = f"----PollinationsGimp{int(time.time() * 1000)}"
    head = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="image"; filename="{filename}"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode()
    data = head + source + f"\r\n--{boundary}--\r\n".encode()
    req = urllib.request.Request(
        f"{CLEARBACKDROP_BASE}/api/v1/remove-background",
        data=data,
        method="POST",
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "image/png",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Content-Length": str(len(data)),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            payload = response.read()
            if not payload.startswith(b"\x89PNG"):
                raise PollinationsError("rmbg", "ClearBackdrop returned an unexpected response")
            def int_header(name: str) -> int | None:
                value = response.headers.get(name)
                return int(value) if value and value.isdigit() else None
            return RmbgResult(
                payload,
                limit=int_header("X-RateLimit-Limit"),
                remaining=int_header("X-RateLimit-Remaining"),
                reset_seconds=int_header("X-RateLimit-Reset"),
                cached=str(response.headers.get("X-Cache") or "").upper() == "HIT",
                provider="clearbackdrop",
            )
    except urllib.error.HTTPError as exc:
        message = {413: "Image exceeds ClearBackdrop's 15 MB limit", 415: "Unsupported image type", 429: "ClearBackdrop free hourly quota is exhausted"}.get(exc.code, f"ClearBackdrop HTTP {exc.code}")
        raise PollinationsError("rate_limit" if exc.code == 429 else "rmbg", message, exc.code) from None
    except (TimeoutError, socket.timeout) as exc:
        raise PollinationsError("rmbg", "ClearBackdrop timed out") from exc
    except urllib.error.URLError as exc:
        raise PollinationsError("rmbg", "Could not reach ClearBackdrop") from exc
