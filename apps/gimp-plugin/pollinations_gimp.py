#!/usr/bin/env python3
from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import time
from typing import Any, Callable
from urllib.error import HTTPError, URLError
import urllib.request
from urllib.parse import urlparse
import webbrowser

GEN_BASE = "https://gen.pollinations.ai"
AUTH_BASE = "https://enter.pollinations.ai"
CLIENT_ID = "pk_VZF38YW4tQX36SEn"
SCOPE = "generate"
DEFAULT_TIMEOUT = 90
MAX_IMAGE_BYTES = 32 * 1024 * 1024


def platform_config_dir(
    *,
    environ: dict[str, str] | None = None,
    home: Path | None = None,
    platform_name: str | None = None,
) -> Path:
    values = os.environ if environ is None else environ
    user_home = Path.home() if home is None else Path(home)
    platform = sys.platform if platform_name is None else platform_name
    if platform == "win32":
        root = Path(values.get("APPDATA", user_home / "AppData" / "Roaming"))
    elif platform == "darwin":
        root = user_home / "Library" / "Application Support"
    else:
        root = Path(values.get("XDG_CONFIG_HOME", user_home / ".config"))
    return root / "pollinations-gimp"


TOKEN_FILE = platform_config_dir() / "token.json"

class APIError(RuntimeError):
    def __init__(self, message: str, *, status: int | None = None,
                 code: str | None = None, payload: Any = None):
        super().__init__(message)
        self.status = status
        self.code = code
        self.payload = payload

def _error_message(status: int | None, code: str | None) -> str:
    if status == 401 or code in {"invalid_token", "invalid_client"}:
        return "Authentication expired or is invalid. Connect again."
    if status == 402:
        return "Not enough Pollen balance for this request."
    if status is not None and status >= 500:
        return "Pollinations is temporarily unavailable. Try again shortly."
    if code == "authorization_pending":
        return "Waiting for authorization."
    if code == "slow_down":
        return "Authorization polling was rate-limited."
    if code in {"access_denied", "denied"}:
        return "Authorization was denied."
    if code in {"expired_token", "expired"}:
        return "The device code expired. Connect again."
    return "Pollinations request failed."

def map_http_error(status: int | None, payload: Any = None) -> APIError:
    code = payload.get("error") if isinstance(payload, dict) else None
    return APIError(_error_message(status, code), status=status, code=code,
                    payload=payload)

def _decode_json(raw: bytes) -> Any:
    if not raw:
        return {}
    try:
        return json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}

def request_json(url: str, method: str = "GET", payload: Any = None,
                 token: str | None = None, timeout: float = DEFAULT_TIMEOUT,
                 opener: Callable[..., Any] | None = None) -> Any:
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(request, timeout=timeout) as response:
            body = response.read()
            status = getattr(response, "status", 200)
    except HTTPError as error:
        body = error.read()
        raise map_http_error(error.code, _decode_json(body)) from None
    except (TimeoutError, URLError, OSError) as error:
        timed_out = isinstance(error, TimeoutError) or (
            isinstance(error, URLError) and isinstance(error.reason, TimeoutError)
        )
        code = "timeout" if timed_out else "network"
        message = ("The request timed out. Try again."
                   if code == "timeout" else
                   "Could not reach Pollinations. Check your connection.")
        raise APIError(message, code=code) from None
    result = _decode_json(body)
    if status < 200 or status >= 300:
        raise map_http_error(status, result)
    return result

def _required_string(data: dict[str, Any], key: str) -> str:
    value = data.get(key)
    if not isinstance(value, str) or not value:
        raise APIError("Pollinations returned an invalid device response.",
                       code="invalid_response")
    return value

def start_device_flow(client_id: str = CLIENT_ID, scope: str = SCOPE,
                      request: Callable[..., Any] = request_json) -> dict[str, Any]:
    response = request(f"{AUTH_BASE}/api/device/code", "POST",
                       {"client_id": client_id, "scope": scope})
    if not isinstance(response, dict):
        raise APIError("Pollinations returned an invalid device response.",
                       code="invalid_response")
    for key in ("device_code", "user_code", "verification_uri_complete"):
        _required_string(response, key)
    if not isinstance(response.get("expires_in"), (int, float)) or response["expires_in"] <= 0:
        raise APIError("Pollinations returned an invalid expiry time.", code="invalid_response")
    if not isinstance(response.get("interval"), (int, float)) or response["interval"] < 0:
        raise APIError("Pollinations returned an invalid polling interval.", code="invalid_response")
    return response

def poll_device_token(device: dict[str, Any], client_id: str = CLIENT_ID,
                      request: Callable[..., Any] = request_json,
                      sleep: Callable[[float], None] = time.sleep,
                      clock: Callable[[], float] = time.monotonic,
                      cancelled: Callable[[], bool] = lambda: False) -> str:
    interval = max(5.0, float(device["interval"]))
    deadline = clock() + float(device["expires_in"])
    while clock() < deadline:
        if cancelled():
            raise APIError("Authorization cancelled.", code="cancelled")
        sleep(interval)
        if cancelled():
            raise APIError("Authorization cancelled.", code="cancelled")
        if clock() >= deadline:
            break
        try:
            response = request(f"{AUTH_BASE}/api/oauth/token", "POST", {
                "grant_type": "urn:ietf:params:oauth:grant-type:device_code",
                "device_code": device["device_code"],
                "client_id": client_id,
            })
        except APIError as error:
            response = error.payload
            if not isinstance(response, dict):
                raise
            code = response.get("error")
            if code == "authorization_pending":
                continue
            if code == "slow_down":
                interval += 5
                continue
            raise map_http_error(error.status, response)
        if isinstance(response, dict) and isinstance(response.get("access_token"), str):
            return validate_token(response["access_token"])
        code = response.get("error") if isinstance(response, dict) else None
        if code in {"authorization_pending", "slow_down"}:
            if code == "slow_down":
                interval += 5
            continue
        raise map_http_error(400, response)
    raise APIError("The device code expired. Connect again.", code="expired_token")

def validate_token(token: Any) -> str:
    if not isinstance(token, str):
        raise APIError("Pollinations returned an invalid token.", code="invalid_token")
    token = token.strip()
    if len(token) < 8 or not token.startswith("sk_"):
        raise APIError("Pollinations returned an invalid token.", code="invalid_token")
    return token


def save_token(token: str, path: Path = TOKEN_FILE) -> None:
    token = validate_token(token)
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        os.chmod(temp_name, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump({"access_token": token}, handle, separators=(",", ":"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temp_name, path)
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
    except Exception:
        try:
            os.unlink(temp_name)
        except OSError:
            pass
        raise


def load_token(path: Path = TOKEN_FILE) -> str | None:
    try:
        data = json.loads(Path(path).read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError, json.JSONDecodeError):
        return None
    if not isinstance(data, dict) or set(data) != {"access_token"}:
        return None
    try:
        return validate_token(data["access_token"])
    except APIError:
        return None

def clear_token(path: Path = TOKEN_FILE) -> None:
    try:
        Path(path).unlink()
    except FileNotFoundError:
        pass

FIELD_ALIASES = {
    "id": "name", "inputModalities": "input_modalities",
    "outputModalities": "output_modalities", "supportedEndpoints": "supported_endpoints",
    "maxReferenceImages": "max_reference_images", "maxReferenceVideos": "max_reference_videos",
    "videoCapabilities": "video_capabilities", "paidOnly": "paid_only",
    "baseModel": "base_model", "brandUrl": "brand_url", "perUserRpm": "per_user_rpm",
    "defaultDuration": "default_duration", "allowedDurations": "allowed_durations",
    "durationStep": "duration_step", "minDuration": "min_duration", "maxDuration": "max_duration",
    "contextLength": "context_length", "isSpecialized": "is_specialized",
}


def normalize_model(raw: Any) -> dict[str, Any] | None:
    if not isinstance(raw, dict):
        return None
    model = dict(raw)
    for source, target in FIELD_ALIASES.items():
        if target not in model and source in model:
            model[target] = model[source]
    if not isinstance(model.get("name"), str) or not model["name"]:
        return None
    for key in ("input_modalities", "output_modalities", "supported_endpoints", "resolutions"):
        if key in model and not isinstance(model[key], list):
            model[key] = []
    return model


def image_models(payload: Any) -> list[dict[str, Any]]:
    rows = payload.get("data", []) if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        return []
    result = []
    for raw in rows:
        model = normalize_model(raw)
        if not model:
            continue
        category = model.get("category")
        outputs = model.get("output_modalities") or []
        if category == "video" or category not in (None, "image"):
            continue
        if category == "image" and outputs and "image" not in outputs:
            continue
        if category is None and "image" not in outputs:
            continue
        result.append(model)
    return result


def _endpoint_set(model: dict[str, Any]) -> set[str]:
    return {str(value).split("?", 1)[0].rstrip("/")
            for value in model.get("supported_endpoints", [])}


def model_can_edit(model: dict[str, Any]) -> bool:
    endpoints = {"/" + endpoint.lstrip("/") for endpoint in _endpoint_set(model)}
    return "image" in (model.get("input_modalities") or []) and \
        "/v1/images/edits" in endpoints


def model_resolutions(model: dict[str, Any]) -> list[str]:
    return [value for value in model.get("resolutions", []) if isinstance(value, str)]


def build_generation_request(prompt: str, model: dict[str, Any], resolution: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"prompt": prompt, "model": model["name"]}
    if resolution in model_resolutions(model):
        body["resolution"] = resolution
    return body


def build_edit_request(prompt: str, model: dict[str, Any], image_data_uri: str,
                       resolution: str | None = None) -> dict[str, Any]:
    if not model_can_edit(model):
        raise APIError("This model does not support image editing.", code="unsupported")
    body: dict[str, Any] = {"prompt": prompt, "model": model["name"], "image": image_data_uri}
    if resolution in model_resolutions(model):
        body["resolution"] = resolution
    return body


def request_image(url: str, timeout: float = DEFAULT_TIMEOUT,
                  opener: Callable[..., Any] | None = None) -> bytes:
    if urlparse(url).scheme != "https":
        raise APIError("Pollinations returned an unsafe image URL.", code="invalid_response")
    request = urllib.request.Request(url, headers={"Accept": "image/*"})
    open_fn = opener or urllib.request.urlopen
    try:
        with open_fn(request, timeout=timeout) as response:
            status = getattr(response, "status", 200)
            content_type = response.headers.get_content_type() if getattr(response, "headers", None) else ""
            length = response.headers.get("Content-Length") if getattr(response, "headers", None) else None
            if length and int(length) > MAX_IMAGE_BYTES:
                raise APIError("The generated image is too large.", code="invalid_response")
            data = response.read(MAX_IMAGE_BYTES + 1)
    except HTTPError as error:
        raise map_http_error(error.code, _decode_json(error.read())) from None
    except (TimeoutError, URLError, OSError, ValueError):
        raise APIError("Could not download the generated image.", code="network") from None
    if status < 200 or status >= 300:
        raise map_http_error(status)
    if content_type and not content_type.startswith("image/"):
        raise APIError("Pollinations returned a non-image response.", code="invalid_response")
    if not data or len(data) > MAX_IMAGE_BYTES:
        raise APIError("Pollinations returned no usable image.", code="invalid_response")
    return data


def decode_image_response(payload: Any,
                          downloader: Callable[[str], bytes] = request_image) -> bytes:
    try:
        item = payload["data"][0]
        encoded = item.get("b64_json")
        if isinstance(encoded, str):
            data = base64.b64decode(encoded, validate=True)
            if not data or len(data) > MAX_IMAGE_BYTES:
                raise ValueError
            return data
        url = item.get("url")
        if isinstance(url, str) and url:
            return downloader(url)
        raise KeyError
    except (KeyError, IndexError, TypeError, ValueError, binascii.Error):
        raise APIError("Pollinations returned no usable image.", code="invalid_response") from None


def png_data_uri(data: bytes) -> str:
    return "data:image/png;base64," + base64.b64encode(data).decode("ascii")


def selection_bounds(image: Any) -> tuple[int, int, int, int] | None:
    selection = image.get_selection()
    raw = selection.bounds()
    if len(raw) == 5:
        non_empty, x1, y1, x2, y2 = raw
        if not non_empty:
            return None
    elif len(raw) == 4:
        x1, y1, x2, y2 = raw
    else:
        return None
    if x2 <= x1 or y2 <= y1:
        return None
    return int(x1), int(y1), int(x2), int(y2)


def active_drawable_png(image: Any, drawable: Any,
                        exporter: Callable[[Any, tuple[int, int, int, int] | None], bytes] | None = None) -> bytes:
    bounds = selection_bounds(image)
    if exporter:
        data = exporter(drawable, bounds)
        if not isinstance(data, bytes):
            raise APIError("GIMP did not return PNG data.", code="export_failed")
        return data
    return _gimp_export_drawable(image, drawable, bounds)


def _gimp_export_drawable(image: Any, drawable: Any,
                          bounds: tuple[int, int, int, int] | None) -> bytes:
    if Gimp is None or Gio is None:
        raise APIError("GIMP bindings are unavailable.", code="gimp_unavailable")
    width = drawable.get_width()
    height = drawable.get_height()
    temp_image = Gimp.Image.new(width, height, Gimp.ImageBaseType.RGB)
    temp_layer = drawable.copy()
    temp_image.insert_layer(temp_layer, None, 0)
    if bounds:
        x1, y1, x2, y2 = bounds
        offsets = drawable.get_offsets() if hasattr(drawable, "get_offsets") else (0, 0)
        temp_layer.set_offsets(offsets[0] - x1, offsets[1] - y1)
        temp_image.crop(x2 - x1, y2 - y1, 0, 0)
    else:
        temp_layer.set_offsets(0, 0)
    fd, filename = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, temp_image,
                       Gio.File.new_for_path(filename), None)
        return Path(filename).read_bytes()
    finally:
        try:
            temp_image.delete()
        except Exception:
            pass
        try:
            os.unlink(filename)
        except OSError:
            pass


def _load_png(data: bytes) -> Any:
    if Gimp is None or Gio is None:
        raise APIError("GIMP bindings are unavailable.", code="gimp_unavailable")
    fd, filename = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        Path(filename).write_bytes(data)
        return Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(filename))
    finally:
        try:
            os.unlink(filename)
        except OSError:
            pass


def insert_png_layer(image: Any, data: bytes, name: str = "Pollinations") -> None:
    loaded = _load_png(data)
    try:
        layers = loaded.get_layers()
        if not layers:
            raise APIError("GIMP could not load the generated image.", code="import_failed")
        layer = layers[0].copy()
        layer.set_name(name)
        image.undo_group_start()
        try:
            image.insert_layer(layer, None, -1)
        finally:
            image.undo_group_end()
        Gimp.displays_flush()
    finally:
        try:
            loaded.delete()
        except Exception:
            pass


def open_png_image(data: bytes) -> Any:
    loaded = _load_png(data)
    if not loaded.get_layers():
        loaded.delete()
        raise APIError("GIMP could not load the generated image.", code="import_failed")
    Gimp.Display.new(loaded)
    Gimp.displays_flush()
    return loaded


def api_models(token: str, request: Callable[..., Any] = request_json) -> list[dict[str, Any]]:
    payload = request(f"{GEN_BASE}/image/models", token=validate_token(token))
    rows = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(rows, list):
        raise APIError("Pollinations returned an invalid model list.", code="invalid_response")
    return image_models(rows)


def generate(token: str, prompt: str, model: dict[str, Any], resolution: str | None = None,
             request: Callable[..., Any] = request_json) -> bytes:
    payload = request(f"{GEN_BASE}/v1/images/generations", "POST",
                      build_generation_request(prompt, model, resolution),
                      validate_token(token))
    return decode_image_response(payload)


def edit(token: str, prompt: str, model: dict[str, Any], image_data_uri: str,
         resolution: str | None = None, request: Callable[..., Any] = request_json) -> bytes:
    payload = request(f"{GEN_BASE}/v1/images/edits", "POST",
                      build_edit_request(prompt, model, image_data_uri, resolution),
                      validate_token(token))
    return decode_image_response(payload)


try:
    import gi
    gi.require_version("Gimp", "3.0")
    gi.require_version("GimpUi", "3.0")
    gi.require_version("Gtk", "3.0")
    from gi.repository import Gio, Gimp, GimpUi, Gtk, GLib
except (ImportError, ValueError):
    Gio = Gimp = GimpUi = Gtk = None


if Gimp is not None:
    class PollinationsPlugin(Gimp.PlugIn):
        CONNECT = "python-fu-pollinations-connect"
        DISCONNECT = "python-fu-pollinations-disconnect"
        GENERATE = "python-fu-pollinations"

        def do_query_procedures(self):
            return [self.CONNECT, self.DISCONNECT, self.GENERATE]

        def do_create_procedure(self, name):
            handlers = {
                self.CONNECT: self.run_connect,
                self.DISCONNECT: self.run_disconnect,
                self.GENERATE: self.run,
            }
            procedure = Gimp.ImageProcedure.new(
                self, name, Gimp.PDBProcType.PLUGIN, handlers[name], None
            )
            procedure.set_image_types("*")
            procedure.add_menu_path("<Image>/Filters/AI/Pollinations AI")
            if name == self.CONNECT:
                procedure.set_menu_label("Connect Account…")
                procedure.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.ALWAYS)
                summary = "Connect a Pollinations account with device authorization."
            elif name == self.DISCONNECT:
                procedure.set_menu_label("Disconnect Account")
                procedure.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.ALWAYS)
                summary = "Remove the Pollinations account token from this computer."
            else:
                procedure.set_menu_label("Generate or Edit…")
                procedure.set_sensitivity_mask(
                    Gimp.ProcedureSensitivityMask.NO_IMAGE
                    | Gimp.ProcedureSensitivityMask.DRAWABLE
                    | Gimp.ProcedureSensitivityMask.DRAWABLES
                )
                summary = "Generate or edit an image with Pollinations AI."
            procedure.set_documentation(summary, summary, name)
            procedure.set_attribution("Pollinations", "Pollinations", "2026")
            return procedure

        def _message(self, parent, text, error=False):
            dialog = Gtk.MessageDialog(transient_for=parent, modal=True,
                                       message_type=(Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO),
                                       buttons=Gtk.ButtonsType.OK, text=text)
            dialog.run()
            dialog.destroy()

        def _background(self, parent, title, work):
            dialog = Gtk.Dialog(title=title, transient_for=parent,
                                flags=Gtk.DialogFlags.MODAL)
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            box = dialog.get_content_area()
            box.set_spacing(10)
            spinner = Gtk.Spinner()
            spinner.start()
            box.pack_start(spinner, False, False, 8)
            box.pack_start(Gtk.Label(label=title), False, False, 8)
            dialog.show_all()
            cancel = threading.Event()
            closed = threading.Event()
            state: dict[str, Any] = {}

            def finish():
                if not closed.is_set():
                    dialog.response(Gtk.ResponseType.OK)
                return False

            def worker():
                try:
                    state["value"] = work(cancel)
                except Exception as error:
                    state["error"] = error
                GLib.idle_add(finish)

            threading.Thread(target=worker, daemon=True).start()
            response = dialog.run()
            cancel.set()
            closed.set()
            dialog.destroy()
            if response != Gtk.ResponseType.OK:
                raise APIError("Operation cancelled.", code="cancelled")
            if "error" in state:
                raise state["error"]
            return state.get("value")

        def _connect(self, parent):
            device = self._background(
                parent, "Requesting a wallet code…", lambda _: start_device_flow()
            )
            dialog = Gtk.Dialog(title="Connect Pollinations Account",
                                transient_for=parent, flags=Gtk.DialogFlags.MODAL)
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            browser_button = Gtk.Button(label="Open Browser")
            browser_button.connect(
                "clicked",
                lambda *_: webbrowser.open(device["verification_uri_complete"], new=2),
            )
            dialog.get_action_area().pack_end(browser_button, False, False, 0)
            area = dialog.get_content_area()
            area.set_spacing(10)
            area.pack_start(Gtk.Label(
                label="Approve this code in your browser. GIMP will keep waiting until you approve or cancel.",
                wrap=True, xalign=0), False, False, 8)
            code = Gtk.Label(label=device["user_code"])
            code.set_selectable(True)
            area.pack_start(code, False, False, 8)
            address = Gtk.Label(label=device["verification_uri_complete"], xalign=0)
            address.set_selectable(True)
            area.pack_start(address, False, False, 8)
            dialog.show_all()
            cancel = threading.Event()
            closed = threading.Event()
            state: dict[str, Any] = {}

            def finish():
                if not closed.is_set():
                    dialog.response(Gtk.ResponseType.OK)
                return False

            def worker():
                try:
                    state["token"] = poll_device_token(
                        device,
                        sleep=lambda seconds: cancel.wait(seconds),
                        cancelled=cancel.is_set,
                    )
                except Exception as error:
                    state["error"] = error
                GLib.idle_add(finish)

            threading.Thread(target=worker, daemon=True).start()
            response = dialog.run()
            cancel.set()
            closed.set()
            dialog.destroy()
            if response != Gtk.ResponseType.OK:
                raise APIError("Authorization cancelled.", code="cancelled")
            if "error" in state:
                raise state["error"]
            token = state.get("token")
            if not token:
                raise APIError("Pollinations returned no account token.", code="invalid_response")
            save_token(token)
            return token

        def _dialog(self, image, models):
            dialog = Gtk.Dialog(title="Pollinations AI", flags=Gtk.DialogFlags.MODAL)
            dialog.add_button("Cancel", Gtk.ResponseType.CANCEL)
            dialog.add_button("Generate", Gtk.ResponseType.OK)
            area = dialog.get_content_area()
            area.set_spacing(8)
            prompt = Gtk.TextView(); prompt.set_wrap_mode(Gtk.WrapMode.WORD); prompt.set_size_request(460, 90)
            area.pack_start(Gtk.Label(label="Prompt", xalign=0), False, False, 0); area.pack_start(prompt, False, False, 0)
            combo = Gtk.ComboBoxText()
            for model in models: combo.append(model["name"], model["name"])
            combo.set_active(0)
            area.pack_start(Gtk.Label(label="Model", xalign=0), False, False, 0); area.pack_start(combo, False, False, 0)
            resolution = Gtk.ComboBoxText()
            area.pack_start(Gtk.Label(label="Resolution", xalign=0), False, False, 0); area.pack_start(resolution, False, False, 0)
            edit_check = Gtk.CheckButton(label="Edit active drawable / selection")
            area.pack_start(edit_check, False, False, 0)
            output = Gtk.ComboBoxText()
            output.append("layer", "New layer in current image")
            output.append("image", "New image")
            output.set_active_id("layer" if image is not None else "image")
            area.pack_start(Gtk.Label(label="Output", xalign=0), False, False, 0)
            area.pack_start(output, False, False, 0)

            def selected():
                return next((m for m in models if m["name"] == combo.get_active_id()), models[0])

            def changed(*_):
                model = selected(); resolution.remove_all()
                values = model_resolutions(model)
                for value in values: resolution.append(value, value)
                resolution.set_active(0)
                resolution.set_visible(bool(values))
                edit_check.set_visible(image is not None and model_can_edit(model))
                edit_check.set_active(False)
                output.set_sensitive(image is not None)

            def edit_changed(*_):
                editing = edit_check.get_active()
                if editing:
                    output.set_active_id("layer")
                output.set_sensitive(not editing)

            combo.connect("changed", changed)
            edit_check.connect("toggled", edit_changed)
            changed()
            dialog.show_all(); changed()
            response = dialog.run()
            if response != Gtk.ResponseType.OK:
                dialog.destroy(); return None
            text_buffer = prompt.get_buffer(); start, end = text_buffer.get_bounds()
            text = text_buffer.get_text(start, end, False).strip()
            model = selected(); chosen_resolution = resolution.get_active_id() if resolution.get_visible() else None
            do_edit = edit_check.get_active() and model_can_edit(model)
            target = output.get_active_id() or "layer"
            dialog.destroy()
            if not text: raise APIError("Enter a prompt.", code="invalid_input")
            source_uri = None
            if do_edit:
                drawables = image.get_selected_drawables()
                if not drawables: raise APIError("Select a drawable to edit.", code="invalid_input")
                source_uri = png_data_uri(active_drawable_png(image, drawables[0]))
            return {
                "prompt": text,
                "model": model,
                "resolution": chosen_resolution,
                "edit": do_edit,
                "source": source_uri,
                "target": target,
            }

        def _return(self, procedure, status):
            return procedure.new_return_values(status, GLib.Error())

        def _run_account_action(self, procedure, action):
            GimpUi.init("pollinations_gimp")
            try:
                action()
                return self._return(procedure, Gimp.PDBStatusType.SUCCESS)
            except APIError as error:
                if error.code == "cancelled":
                    return self._return(procedure, Gimp.PDBStatusType.CANCEL)
                self._message(None, str(error), error=True)
                return self._return(procedure, Gimp.PDBStatusType.EXECUTION_ERROR)
            except Exception:
                self._message(None, "The account action could not be completed.", error=True)
                return self._return(procedure, Gimp.PDBStatusType.EXECUTION_ERROR)

        def run_connect(self, procedure, run_mode, image, drawables, config, run_data):
            def connect():
                self._connect(None)
                self._message(None, "Pollinations account connected.")
            return self._run_account_action(procedure, connect)

        def run_disconnect(self, procedure, run_mode, image, drawables, config, run_data):
            def disconnect():
                clear_token()
                self._message(None, "Pollinations account disconnected.")
            return self._run_account_action(procedure, disconnect)

        def run(self, procedure, run_mode, image, drawables, config, run_data):
            parent = None
            GimpUi.init("pollinations_gimp")
            try:
                token = load_token()
                if not token: token = self._connect(parent)
                try:
                    models = self._background(
                        parent, "Loading image models…",
                        lambda _: api_models(token),
                    )
                except APIError as error:
                    if error.status != 401: raise
                    clear_token()
                    token = self._connect(parent)
                    models = self._background(
                        parent, "Loading image models…",
                        lambda _: api_models(token),
                    )
                if not models: raise APIError("No image models are available.", code="no_models")
                options = self._dialog(image, models)
                if options is None:
                    return self._return(procedure, Gimp.PDBStatusType.CANCEL)

                def create_result(_):
                    if options["edit"]:
                        return edit(token, options["prompt"], options["model"],
                                    options["source"], options["resolution"])
                    return generate(token, options["prompt"], options["model"],
                                    options["resolution"])

                data = self._background(parent, "Generating image…", create_result)
                name = f"Pollinations · {options['model']['name']}"
                if options["target"] == "image" and not options["edit"]:
                    open_png_image(data)
                else:
                    insert_png_layer(image, data, name)
                return self._return(procedure, Gimp.PDBStatusType.SUCCESS)
            except APIError as error:
                if error.code == "cancelled":
                    return self._return(procedure, Gimp.PDBStatusType.CANCEL)
                if error.status == 401:
                    clear_token()
                    self._message(parent, "Authentication expired. Run the plug-in again to reconnect.", error=True)
                else:
                    self._message(parent, str(error), error=True)
                return self._return(procedure, Gimp.PDBStatusType.EXECUTION_ERROR)
            except Exception:
                self._message(parent, "The Pollinations plug-in could not complete the operation.", error=True)
                return self._return(procedure, Gimp.PDBStatusType.EXECUTION_ERROR)


if __name__ == "__main__" and Gimp is not None:
    Gimp.main(PollinationsPlugin.__gtype__, sys.argv)
