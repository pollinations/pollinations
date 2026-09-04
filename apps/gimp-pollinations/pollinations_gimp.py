#!/usr/bin/env python3
"""Pollinations AI minimal++ plug-in for GIMP 3."""
from __future__ import annotations

import os
import sys
import json
import tempfile
import concurrent.futures
import threading
import time
import webbrowser
from pathlib import Path

import gi

gi.require_version("Gimp", "3.0")
gi.require_version("GimpUi", "3.0")
gi.require_version("Gtk", "3.0")
gi.require_version("GdkPixbuf", "2.0")
from gi.repository import Gio, Gimp, GimpUi, GLib, Gtk, GdkPixbuf  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parent))
import pollinations_api as api  # noqa: E402
import pollinations_core as core  # noqa: E402
import pollinations_i18n as i18n  # noqa: E402

PLUGIN_VERSION = "1.2.0"
APP_CLIENT_ID = os.environ.get("POLLINATIONS_GIMP_APP_KEY", 'pk_6AVZSjGZQfOecORP')

PROC_CONNECT = "python-fu-pollinations-connect"
PROC_GENERATE = "python-fu-pollinations-generate"
PROC_GENERATE_LAYER = "python-fu-pollinations-generate-layer"
PROC_EDIT = "python-fu-pollinations-edit"
PROC_CONTEXT = "python-fu-pollinations-context-object"
PROC_SEPARATE = "python-fu-pollinations-extract-separate"
PROC_ISOLATE = "python-fu-pollinations-isolate-rmbg"
PROC_SETTINGS = "python-fu-pollinations-settings"
PROC_DISCONNECT = "python-fu-pollinations-disconnect"
PROC_ACTIVITY = "python-fu-pollinations-activity"
PROC_ABOUT = "python-fu-pollinations-about"

RESPONSE_REVIEW = 1001
RESPONSE_CONNECT = 1002
RESPONSE_DISCONNECT = 1003
RESPONSE_REFRESH = 1004
RESPONSE_REPLAY = 1005
RESPONSE_ADVISOR_PROMPT = 1011
RESPONSE_ADVISOR_MODEL = 1012
RESPONSE_ADVISOR_BOTH = 1013


def _config_dir() -> Path:
    return Path(Gimp.directory()) / "pollinations-ai"


def _store() -> api.TokenStore:
    return api.TokenStore(_config_dir() / "token.json")


def _settings_store() -> core.SettingsStore:
    return core.SettingsStore(_config_dir() / "settings.json")



def _settings() -> core.Settings:
    return _settings_store().load()


def _lang(settings: core.Settings | None = None) -> str:
    return i18n.resolve_language((settings or _settings()).language)


def _t(key: str, settings: core.Settings | None = None, **params) -> str:
    return i18n.tr(key, _lang(settings), **params)


def _surface_dialog(dialog) -> None:
    """Keep plug-in dialogs visible after a browser or GIMP steals focus."""
    try:
        dialog.set_modal(True)
        dialog.set_keep_above(True)
        dialog.set_position(Gtk.WindowPosition.CENTER_ALWAYS)
        dialog.set_urgency_hint(True)
    except Exception:
        pass


def _present_dialog(dialog) -> None:
    _surface_dialog(dialog)
    try:
        dialog.show_all()
        dialog.present()
    except Exception:
        pass


def _message(text: str, *, error: bool = False, title: str = "Pollinations AI") -> None:
    dialog = Gtk.MessageDialog(
        modal=True,
        message_type=Gtk.MessageType.ERROR if error else Gtk.MessageType.INFO,
        buttons=Gtk.ButtonsType.OK,
        text=title,
    )
    dialog.format_secondary_text(text)
    _present_dialog(dialog)
    dialog.run()
    dialog.destroy()


def _show_error(exc: Exception) -> None:
    if isinstance(exc, api.PollinationsError):
        _message(f"{exc}\n\n{exc.recovery}", error=True)
    else:
        _message(f"Unexpected error: {exc}", error=True)


def _success(procedure):
    # Passing a GLib.Error on SUCCESS makes GIMP surface a phantom error dialog.
    return procedure.new_return_values(Gimp.PDBStatusType.SUCCESS, None)


def _cancel(procedure):
    return procedure.new_return_values(Gimp.PDBStatusType.CANCEL, None)


def _execution_error(procedure, exc: Exception):
    _show_error(exc)
    return procedure.new_return_values(
        Gimp.PDBStatusType.EXECUTION_ERROR, GLib.Error(message=str(exc))
    )


def _open_uri(uri: str) -> None:
    try:
        Gio.AppInfo.launch_default_for_uri(uri, None)
        return
    except Exception:
        pass
    webbrowser.open(uri)


def _require_token(settings: core.Settings | None = None) -> str:
    token = _store().load()
    if not token:
        raise api.PollinationsError("auth", _t("error.not_connected", settings))
    return token


def _connect_account(settings: core.Settings | None = None) -> bool:
    settings = settings or _settings()
    if not APP_CLIENT_ID:
        raise api.PollinationsError("config", "This development build has no GIMP App Key configured.")
    session = api.start_device_flow(APP_CLIENT_ID)
    dialog = GimpUi.Dialog(title=_t("connect.title", settings), role="pollinations-connect")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    dialog.set_default_size(560, -1)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=14)
    box.pack_start(Gtk.Label(label=_t("connect.explain", settings), xalign=0.0, wrap=True), False, False, 0)
    code = Gtk.Label(xalign=0.0, use_markup=True)
    code.set_markup(f"Code: <b><tt>{GLib.markup_escape_text(session.user_code)}</tt></b>")
    box.pack_start(code, False, False, 0)
    row = Gtk.Box(spacing=8)
    url = Gtk.Entry(text=session.verification_uri, editable=False)
    url.set_hexpand(True)
    row.pack_start(url, True, True, 0)
    open_button = Gtk.Button(label=_t("connect.open", settings))
    open_button.connect("clicked", lambda _b: _open_uri(session.verification_uri_complete))
    row.pack_start(open_button, False, False, 0)
    box.pack_start(row, False, False, 0)
    status = Gtk.Label(label=_t("connect.wait", settings), xalign=0.0)
    spinner = Gtk.Spinner()
    spinner.start()
    box.pack_start(status, False, False, 0)
    box.pack_start(spinner, False, False, 0)
    dialog.get_content_area().pack_start(box, True, True, 0)
    _present_dialog(dialog)

    state = {"done": False, "token": None, "error": None}
    deadline = time.monotonic() + session.expires_in

    def finish(response):
        if dialog.get_visible():
            try:
                status.set_text(_t("connect.approved", settings) if response == Gtk.ResponseType.OK else _t("connect.failed", settings))
                _surface_dialog(dialog)
                dialog.present()
            except Exception:
                pass
            dialog.response(response)
        return False

    def poller():
        while not state["done"] and time.monotonic() < deadline:
            time.sleep(session.interval)
            if state["done"]:
                return
            try:
                token = api.poll_device_token(session)
                if token:
                    state["token"] = token
                    state["done"] = True
                    GLib.idle_add(finish, Gtk.ResponseType.OK)
                    return
            except Exception as exc:
                state["error"] = exc
                state["done"] = True
                GLib.idle_add(finish, Gtk.ResponseType.REJECT)
                return
        if not state["done"]:
            state["error"] = api.PollinationsError("auth", "Device authorization expired")
            state["done"] = True
            GLib.idle_add(finish, Gtk.ResponseType.REJECT)

    threading.Thread(target=poller, daemon=True).start()
    try:
        dialog.set_modal(False)
        dialog.set_keep_above(False)
    except Exception:
        pass
    _open_uri(session.verification_uri_complete)
    response = dialog.run()
    state["done"] = True
    spinner.stop()
    dialog.destroy()
    if response == Gtk.ResponseType.OK and state["token"]:
        # Persist immediately. The next step visibly loads/validates the live
        # catalogs inside the configuration splash instead of leaving GIMP blank.
        _store().save(state["token"])
        return True
    if state["error"]:
        raise state["error"]
    return False


def _run_connect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_CONNECT)
    try:
        settings = _settings_store().load()
        if not settings.onboarding_done:
            return _success(procedure) if _welcome_dialog() else _cancel(procedure)
        return _success(procedure) if _connect_account(settings) else _cancel(procedure)
    except Exception as exc:
        return _execution_error(procedure, exc)


def _run_disconnect(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_DISCONNECT)
    settings = _settings()
    removed = _store().clear()
    _message(_t("disconnect.ok" if removed else "disconnect.none", settings))
    return _success(procedure)


def _selection_bbox(image) -> tuple[int, int, int, int] | None:
    if image is None:
        return None
    try:
        raw = tuple(image.get_selection().bounds(image))
    except Exception:
        return None
    if len(raw) < 4:
        return None
    x1, y1, x2, y2 = [int(v) for v in raw[-4:]]
    non_empty = bool(raw[-5]) if len(raw) >= 5 else (x2 > x1 and y2 > y1)
    if not non_empty or x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2 - x1, y2 - y1


def _drawable_offsets(drawable) -> tuple[int, int]:
    try:
        raw = tuple(drawable.get_offsets())
        return int(raw[-2]), int(raw[-1])
    except Exception:
        return 0, 0


def _drawable_bbox(drawable) -> tuple[int, int, int, int]:
    x, y = _drawable_offsets(drawable)
    return x, y, int(drawable.get_width()), int(drawable.get_height())


def _selected_drawable(image, drawables):
    selected = list(drawables or (image.get_selected_drawables() if image else []) or [])
    if not selected:
        raise api.PollinationsError("bad_request", _t("error.no_image"))
    return selected[0]


def _expanded_bbox(image, bbox: tuple[int, int, int, int], padding_percent: int) -> tuple[int, int, int, int]:
    x, y, w, h = bbox
    pad_x = max(32, int(w * max(0, padding_percent) / 100))
    pad_y = max(32, int(h * max(0, padding_percent) / 100))
    x1 = max(0, x - pad_x)
    y1 = max(0, y - pad_y)
    x2 = min(int(image.get_width()), x + w + pad_x)
    y2 = min(int(image.get_height()), y + h + pad_y)
    return x1, y1, max(1, x2 - x1), max(1, y2 - y1)


def _save_image_png(image) -> bytes:
    fd, path = tempfile.mkstemp(prefix="pollinations-source-", suffix=".png")
    os.close(fd)
    try:
        if not Gimp.file_save(Gimp.RunMode.NONINTERACTIVE, image, Gio.File.new_for_path(path), None):
            raise api.PollinationsError("upstream", "GIMP could not export the source image")
        return Path(path).read_bytes()
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def _export_composite_png(image, bbox: tuple[int, int, int, int] | None = None, *, max_dim: int | None = None) -> bytes:
    dup = image.duplicate()
    try:
        if bbox:
            x, y, w, h = bbox
            dup.crop(w, h, x, y)
        if max_dim and max(dup.get_width(), dup.get_height()) > max_dim:
            scale = max_dim / max(dup.get_width(), dup.get_height())
            dup.scale(max(1, int(dup.get_width() * scale)), max(1, int(dup.get_height() * scale)))
        dup.flatten()
        return _save_image_png(dup)
    finally:
        dup.delete()


def _export_full_drawable_png(drawable) -> bytes:
    temp = Gimp.Image.new(int(drawable.get_width()), int(drawable.get_height()), Gimp.ImageBaseType.RGB)
    try:
        layer = Gimp.Layer.new_from_drawable(drawable, temp)
        temp.insert_layer(layer, None, 0)
        layer.set_offsets(0, 0)
        return _save_image_png(temp)
    finally:
        temp.delete()


def _export_selected_pixels(image, drawables) -> tuple[bytes, tuple[int, int, int, int]]:
    drawable = _selected_drawable(image, drawables)
    bbox = _selection_bbox(image)
    if bbox is None:
        return _export_full_drawable_png(drawable), _drawable_bbox(drawable)
    if not Gimp.edit_copy([drawable]):
        raise api.PollinationsError("bad_request", "The active layer or selection could not be copied")
    temp_image = Gimp.edit_paste_as_new_image()
    if temp_image is None:
        raise api.PollinationsError("bad_request", "The active selection is empty")
    try:
        return _save_image_png(temp_image), bbox
    finally:
        temp_image.delete()


def _normalize_raster_for_gimp(data: bytes) -> bytes:
    """Decode and re-encode raster media as clean PNG without provider metadata.

    This prevents malformed EXIF/comment payloads (for example invalid UTF-8
    git-comment parasites) from reaching GIMP's image parasite importer.
    """
    media = api._sniff_media_type(data)
    if media == "image/svg+xml":
        return data
    loader = GdkPixbuf.PixbufLoader.new()
    try:
        loader.write(data)
        loader.close()
        pixbuf = loader.get_pixbuf()
        if pixbuf is None:
            raise ValueError("GdkPixbuf returned no raster")
        fd, path = tempfile.mkstemp(prefix="pollinations-clean-", suffix=".png")
        os.close(fd)
        try:
            pixbuf.savev(path, "png", [], [])
            return Path(path).read_bytes()
        finally:
            try:
                os.unlink(path)
            except FileNotFoundError:
                pass
    except Exception as exc:
        raise api.PollinationsError("upstream", f"GIMP could not normalize the returned image: {exc}") from exc


def _write_generated(result: api.GeneratedImage) -> str:
    clean = _normalize_raster_for_gimp(result.data)
    suffix = result.suffix if result.media_type == "image/svg+xml" else ".png"
    fd, path = tempfile.mkstemp(prefix="pollinations-gimp-", suffix=suffix)
    with os.fdopen(fd, "wb") as handle:
        handle.write(clean)
    return path


def _import_layer_bytes(
    image,
    data: bytes,
    *,
    name: str,
    bbox: tuple[int, int, int, int] | None = None,
    parent=None,
    position: int = 0,
):
    result = api.GeneratedImage(data, api._sniff_media_type(data))
    path = _write_generated(result)
    try:
        layer = Gimp.file_load_layer(Gimp.RunMode.NONINTERACTIVE, image, Gio.File.new_for_path(path))
        if layer is None:
            raise api.PollinationsError("upstream", "GIMP could not load the generated image as a layer")
        layer.set_name(name[:120])
        image.insert_layer(layer, parent, position)
        if bbox:
            x, y, w, h = bbox
            if layer.get_width() != w or layer.get_height() != h:
                layer.scale(w, h, False)
            layer.set_offsets(x, y)
        return layer
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


def _compose_full_background(image, patch_bytes: bytes, patch_bbox) -> bytes:
    """Return a full-canvas flattened background with an AI patch over source."""
    dup = image.duplicate()
    try:
        dup.flatten()
        _import_layer_bytes(
            dup,
            patch_bytes,
            name="Pollinations background patch",
            bbox=patch_bbox,
            position=0,
        )
        dup.flatten()
        return _save_image_png(dup)
    finally:
        dup.delete()


def _export_drawable_with_hole(drawable, cutout_bytes: bytes, cutout_bbox, *, grow_px: int = 4) -> bytes:
    """Create a full-drawable PNG with the cutout alpha punched out of the source."""
    dw, dh = int(drawable.get_width()), int(drawable.get_height())
    dx, dy = _drawable_offsets(drawable)
    temp = Gimp.Image.new(dw, dh, Gimp.ImageBaseType.RGB)
    try:
        bg = Gimp.Layer.new_from_drawable(drawable, temp); temp.insert_layer(bg, None, 0); bg.set_offsets(0, 0); bg.add_alpha()
        x, y, w, h = cutout_bbox
        rel = (max(0, x - dx), max(0, y - dy), w, h)
        cut = _import_layer_bytes(temp, cutout_bytes, name="Pollinations mask", bbox=rel, position=0)
        if not temp.select_item(Gimp.ChannelOps.REPLACE, cut):
            raise api.PollinationsError("bad_request", "Could not derive a selection from the RMBG alpha channel")
        selection = temp.get_selection()
        if grow_px > 0:
            selection.grow(temp, int(grow_px))
        if not bg.edit_clear():
            raise api.PollinationsError("bad_request", "Could not clear the object mask from the source layer")
        temp.remove_layer(cut)
        temp.set_selected_layers([bg])
        selection.none(temp)
        return _save_image_png(temp)
    finally:
        temp.delete()


def _activity_log_path() -> Path:
    return _config_dir() / "activity.jsonl"


def _account_snapshot(token: str | None) -> dict:
    snap = {"connected": bool(token), "profile": {}, "key": {}, "balance": {}}
    if not token:
        return snap
    try: snap["profile"] = api.fetch_account_profile(token)
    except Exception: pass
    try: snap["key"] = api.fetch_key_info(token)
    except Exception: pass
    try: snap["balance"] = api.fetch_account_balance(token)
    except Exception: pass
    return snap


def _account_identity(snapshot: dict, settings: core.Settings) -> str:
    if not snapshot.get("connected"):
        return _t("settings.disconnected", settings)
    profile = snapshot.get("profile") or {}
    name = str(profile.get("name") or "").strip()
    email = str(profile.get("email") or "").strip()
    github = str(profile.get("githubUsername") or "").strip()
    if name and email:
        return f"{name} · {email}"
    if email:
        return email
    if name:
        return name
    if github:
        return "@" + github.lstrip("@")
    return _t("settings.connected", settings)


def _account_details(snapshot: dict, settings: core.Settings) -> str:
    if not snapshot.get("connected"):
        return _t("account.connect_hint", settings)
    profile = snapshot.get("profile") or {}; key = snapshot.get("key") or {}; balance = snapshot.get("balance") or {}
    lines = [_account_identity(snapshot, settings)]
    key_name = str(key.get("name") or "").strip(); key_type = str(key.get("type") or "").strip()
    if key_name or key_type:
        lines.append(_t("account.key", settings, name=key_name or "—", type=key_type or "—"))
    visible_balance = balance.get("balance")
    if isinstance(visible_balance, (int, float)):
        lines.append(_t("account.key_balance", settings, value=_human_pollen(float(visible_balance))))
    budget = key.get("pollenBudget")
    if isinstance(budget, (int, float)):
        lines.append(_t("account.key_budget", settings, value=_human_pollen(float(budget))))
    acct = balance.get("accountBalance") if isinstance(balance, dict) else None
    if isinstance(acct, dict):
        total, paid = acct.get("total"), acct.get("paid")
        if isinstance(total, (int, float)) and isinstance(paid, (int, float)):
            quest = max(0.0, float(total) - float(paid))
            lines.append(_t("account.wallet", settings, total=_human_pollen(float(total)), quest=_human_pollen(quest), paid=_human_pollen(float(paid))))
    if profile.get("communityEndpointsAllowed") is True:
        lines.append(_t("account.community_allowed", settings))
    return "\n".join(lines)


def _estimated_cost_value(model) -> float | None:
    value = getattr(model, "estimated_cost", None)
    if isinstance(value, (int, float)):
        return float(value)
    stat = _MODEL_STATS.get(getattr(model, "name", ""))
    value = getattr(stat, "avg_cost_pollen", None) if stat else None
    return float(value) if isinstance(value, (int, float)) else None


def _selection_reason(model, auto_selected: bool, health, settings: core.Settings) -> str:
    if not auto_selected:
        return _t("activity.manual_choice", settings)
    parts = [_t("activity.auto_reason", settings)]
    if not getattr(model, "paid_only", False): parts.append(_t("model.quest", settings))
    if not getattr(model, "community", False): parts.append(_t("model.official", settings))
    h = health.get(getattr(model, "name", "")) if isinstance(health, dict) else None
    if h is not None:
        parts.append(_health_text(h, settings))
    cost = _estimated_cost_value(model)
    if cost is not None:
        parts.append(_human_pollen(cost))
    return " · ".join(parts)


def _append_activity(action: str, choice: dict | None, used_model=None, *, health=None, provider: str | None = None, extra: dict | None = None) -> None:
    settings = _settings()
    requested = choice.get("model") if choice else None
    used = used_model or requested
    entry = {
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        "action": action,
        "requested_model": getattr(requested, "name", None),
        "used_model": getattr(used, "name", None),
        "auto_selected": bool(choice.get("auto_selected")) if choice else False,
        "selection_reason": _selection_reason(used, bool(choice.get("auto_selected")) if choice else False, health or {}, settings) if used else "",
        "advisor": choice.get("advisor_id") if choice else None,
        "advisor_reviewed": bool(choice.get("advisor_reviewed")) if choice else False,
        "advisor_applied": bool(choice.get("advisor_applied")) if choice else False,
        "advisor_suggested_model": choice.get("advisor_suggested_model") if choice else None,
        "prompt": choice.get("prompt") if choice else None,
        "provider": provider,
        "estimated_cost_pollen": (choice.get("estimated_cost_pollen") if choice and choice.get("estimated_cost_pollen") is not None else _estimated_cost_value(used) if used else 0.0 if provider == "clearbackdrop" else None),
    }
    if requested is not None and used is not None and getattr(requested, "name", None) != getattr(used, "name", None):
        entry["fallback_from"] = getattr(requested, "name", None)
    if extra: entry.update(extra)
    path = _activity_log_path(); path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    try: os.chmod(path.parent, 0o700)
    except OSError: pass
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(entry, ensure_ascii=False, separators=(",", ":")) + "\n")
    try: os.chmod(path, 0o600)
    except OSError: pass


def _read_activity(limit: int = 100) -> list[dict]:
    try: lines = _activity_log_path().read_text(encoding="utf-8").splitlines()[-max(1, limit):]
    except OSError: return []
    out = []
    for line in reversed(lines):
        try:
            obj = json.loads(line)
            if isinstance(obj, dict): out.append(obj)
        except ValueError: continue
    return out


def _activity_text(rows: list[dict], settings: core.Settings) -> str:
    blocks = []
    for row in rows:
        model = row.get("used_model") or row.get("provider") or "—"
        cost = row.get("estimated_cost_pollen")
        cost_text = _human_pollen(cost) if isinstance(cost, (int, float)) else "—"
        head = f"{row.get('timestamp','')}  ·  {row.get('action','')}  ·  {model}  ·  {cost_text}"
        details = []
        if row.get("selection_reason"): details.append(row["selection_reason"])
        if row.get("fallback_from"): details.append(f"fallback: {row['fallback_from']} → {model}")
        if row.get("advisor_reviewed"):
            details.append(f"Advisor {row.get('advisor') or 'Auto'} · " + (_t("activity.advice_applied", settings) if row.get("advisor_applied") else _t("activity.advice_not_applied", settings)))
        if row.get("prompt"): details.append(f"Prompt: {row['prompt']}")
        blocks.append(head + ("\n  " + "\n  ".join(details) if details else ""))
    return "\n\n".join(blocks) if blocks else _t("activity.empty", settings)


def _api_usage_text(rows: list[dict], settings: core.Settings) -> str:
    lines = []
    for row in rows:
        cost = row.get("cost_usd")
        cost_text = _human_pollen(float(cost)) if isinstance(cost, (int, float)) else "—"
        ms = row.get("response_time_ms")
        elapsed = f"{float(ms)/1000:.1f}s" if isinstance(ms, (int, float)) else "—"
        lines.append(f"{row.get('timestamp','')}  ·  {row.get('type','')}  ·  {row.get('model','—')}  ·  {cost_text}  ·  {elapsed}")
    return "\n".join(lines) if lines else _t("activity.no_api_usage", settings)


def _run_activity(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_ACTIVITY)
    try:
        # Account & Usage is a functional surface, so on a true first run it
        # must follow the same Welcome -> BYOP -> Settings onboarding path as
        # generation/edit actions. About remains the only informational bypass.
        if not _ensure_onboarding():
            return _cancel(procedure)
        settings = _settings(); token = _store().load(); snapshot = _account_snapshot(token)
        dialog = GimpUi.Dialog(title=_t("activity.title", settings), role="pollinations-activity"); _surface_dialog(dialog)
        if token:
            dialog.add_button(_t("menu.disconnect", settings), RESPONSE_DISCONNECT)
        else:
            dialog.add_button(_t("menu.connect", settings), RESPONSE_CONNECT)
        dialog.add_button(_t("button.close", settings), Gtk.ResponseType.CLOSE); dialog.set_default_size(1040, 800)
        root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=12)
        asset = Path(__file__).resolve().parent / "assets" / "pollinations-gimp-welcome.jpg"
        if asset.exists():
            try: root.pack_start(Gtk.Image.new_from_pixbuf(GdkPixbuf.Pixbuf.new_from_file_at_scale(str(asset), 1000, 150, True)), False, False, 0)
            except Exception: pass
        identity = _account_identity(snapshot, settings)
        account_label = Gtk.Label(xalign=0.0, use_markup=True)
        status_color = "#4fa866" if token else "#c85d5d"
        account_label.set_markup(f"<span foreground='{status_color}'><b>● {GLib.markup_escape_text(identity)}</b></span>")
        root.pack_start(account_label, False, False, 0)
        details = Gtk.Label(label=_account_details(snapshot, settings), xalign=0.0, wrap=True)
        details.set_max_width_chars(115); details.get_style_context().add_class("dim-label"); root.pack_start(details, False, False, 0)
        tabs = Gtk.Notebook(); root.pack_start(tabs, True, True, 0)
        def text_tab(text):
            view = Gtk.TextView(); view.set_editable(False); view.set_cursor_visible(False); view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR); view.get_buffer().set_text(text)
            sw = Gtk.ScrolledWindow(); sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC); sw.add(view); return sw
        tabs.append_page(text_tab(_activity_text(_read_activity(100), settings)), Gtk.Label(label=_t("activity.plugin_log", settings)))
        usage = []
        if token:
            try: usage = api.fetch_key_usage(token, 50)
            except Exception: usage = []
        tabs.append_page(text_tab(_api_usage_text(usage, settings)), Gtk.Label(label=_t("activity.api_usage", settings)))
        dialog.get_content_area().pack_start(root, True, True, 0); _present_dialog(dialog); response = dialog.run(); dialog.destroy()
        if response == RESPONSE_CONNECT:
            if _connect_account(settings):
                return _run_activity(procedure, run_mode, image, drawables, config, data)
            return _cancel(procedure)
        if response == RESPONSE_DISCONNECT:
            _store().clear()
            return _run_activity(procedure, run_mode, image, drawables, config, data)
        return _success(procedure)
    except Exception as exc:
        return _execution_error(procedure, exc)


def _import_result(result: api.GeneratedImage, image, *, destination: str, name: str, bbox=None, parent=None):
    if destination == "layer" and image is not None:
        layer = _import_layer_bytes(image, result.data, name=name, bbox=bbox, parent=parent, position=0)
        image.set_selected_layers([layer])
        Gimp.displays_flush()
        return image
    path = _write_generated(result)
    try:
        new_image = Gimp.file_load(Gimp.RunMode.NONINTERACTIVE, Gio.File.new_for_path(path))
        if new_image is None:
            raise api.PollinationsError("upstream", "GIMP could not load the generated image")
        Gimp.Display.new(new_image)
        Gimp.displays_flush()
        return new_image
    finally:
        try:
            os.unlink(path)
        except FileNotFoundError:
            pass


_MODEL_STATS: dict[str, api.ModelStats] = {}


def _health_text(health, settings: core.Settings) -> str:
    if health is None:
        return _t("health.unknown", settings)
    label = _t(f"health.{health.status}" if health.status in {"on", "degraded", "off"} else "health.unknown", settings)
    parts = [f"{'●' if health.status == 'on' else '◐' if health.status == 'degraded' else '○'} {label}"]
    if health.latency_p50_ms:
        parts.append(_t("model.median_latency", settings, seconds=f"{health.latency_p50_ms / 1000:.1f}"))
    if health.latency_p95_ms:
        parts.append(_t("model.p95_latency", settings, seconds=f"{health.latency_p95_ms / 1000:.1f}"))
    if health.error_rate_pct:
        parts.append(f"5xx {health.error_rate_pct:.1f}%")
    return " · ".join(parts)


def _human_pollen(value: float) -> str:
    value = max(0.0, float(value))
    if value == 0:
        return "0 Pollen"
    if value >= 1:
        return f"{value:.2f}".rstrip("0").rstrip(".") + " Pollen"
    if value >= 0.001:
        digits = 3 if value >= 0.1 else 4 if value >= 0.01 else 5
        return f"{value:.{digits}f}".rstrip("0").rstrip(".") + " Pollen"
    if value >= 0.000001:
        return f"{value * 1000:.3f}".rstrip("0").rstrip(".") + " mPollen"
    return f"{value * 1_000_000:.2f}".rstrip("0").rstrip(".") + " µPollen"


def _images_per_pollen(value: float | None) -> str:
    if not isinstance(value, (int, float)) or value <= 0:
        return ""
    count = 1.0 / float(value)
    if count >= 1000:
        return f"≈{count/1000:.1f}K images/Pollen"
    if count >= 10:
        return f"≈{count:.0f} images/Pollen"
    return f"≈{count:.1f} images/Pollen"


def _cost_text(model, settings: core.Settings) -> str:
    cost = getattr(model, "estimated_cost", None)
    if isinstance(cost, (int, float)):
        per = _images_per_pollen(cost)
        return f"{_human_pollen(cost)} / image" + (f" · {per}" if per else "")
    stats = _MODEL_STATS.get(getattr(model, "name", ""))
    observed = getattr(stats, "avg_cost_pollen", None) if stats else None
    if isinstance(observed, (int, float)) and observed > 0:
        per = _images_per_pollen(observed)
        return _t("cost.observed", settings, cost=_human_pollen(observed)) + (f" · {per}" if per else "")
    pricing = getattr(model, "pricing", {}) or {}
    rate = pricing.get("completionImageTokens") if isinstance(pricing, dict) else None
    if rate is not None:
        try:
            return _t("cost.token_variable", settings, rate=_human_pollen(float(rate)))
        except (TypeError, ValueError):
            pass
    return _t("cost.variable", settings) if pricing else _t("cost.unknown", settings)


def _request_cost(model: api.ImageModel, settings: core.Settings, *, has_image: bool = False, width: int | None = None, height: int | None = None, resolution: str | None = None, quality: str | None = None) -> tuple[str, float | None]:
    """Best-effort request estimate using deterministic catalog variants first."""
    if model.flat_rate:
        pricing = dict(model.pricing or {})
        chosen = None
        variants = list(model.pricing_variants or ())
        by_name = {str(v.get("name") or ""): v for v in variants}
        # Known live variant predicates mirrored from Pollinations registry metadata.
        if has_image and "edit" in by_name:
            chosen = by_name["edit"]
        if model.name == "grok-imagine-image-2.0":
            res = (resolution or "1k").lower(); q = (quality or "medium").lower()
            key = "low_2k" if q == "low" and res == "2k" else "low_1k" if q == "low" else "medium_2k" if res == "2k" else ""
            if key and key in by_name: chosen = by_name[key]
        elif model.name == "qwen-image-3" and "2k" in by_name and width and height and width * height > 1536 * 1536:
            chosen = by_name["2k"]
        elif model.name == "nova-canvas" and "2048" in by_name and width and height and max(width, height) > 1024:
            chosen = by_name["2048"]
        if chosen and isinstance(chosen.get("pricing"), dict): pricing = dict(chosen["pricing"])
        total = 0.0; known = False
        try:
            completion = pricing.get("completionImageTokens")
            if completion is not None: total += float(completion); known = True
            prompt_image = pricing.get("promptImageTokens")
            if has_image and prompt_image is not None: total += float(prompt_image); known = True
        except (TypeError, ValueError):
            known = False
        if known:
            label = _human_pollen(total) + " / request"
            per = _images_per_pollen(total)
            if per: label += " · " + per
            if chosen and chosen.get("label"): label += " · " + str(chosen["label"])
            return label, total
    # Token-priced models: observed recent full-request cost is safer than inventing token counts.
    stat = _MODEL_STATS.get(model.name)
    observed = getattr(stat, "avg_cost_pollen", None) if stat else None
    if isinstance(observed, (int, float)) and observed > 0:
        label = _t("cost.observed", settings, cost=_human_pollen(observed))
        per = _images_per_pollen(observed)
        if per: label += " · " + per
        return label, float(observed)
    text = _cost_text(model, settings)
    return text, model.estimated_cost if isinstance(model.estimated_cost, (int, float)) else None


def _model_display(model: api.ImageModel, settings: core.Settings, health=None) -> str:
    tags = [_t("model.quest", settings) if not model.paid_only else _t("model.paid", settings)]
    tags.append(_t("model.community", settings) if model.community else _t("model.official", settings))
    tags.append(_t("model.generate", settings))
    if model.supports_edit:
        tags.append(_t("model.edit", settings))
    if model.max_reference_images:
        tags.append(f"Refs {model.max_reference_images}")
    if model.supports_seed:
        tags.append("Seed")
    if model.supports_quality:
        tags.append("Quality")
    if model.resolutions:
        tags.append("/".join(model.resolutions[:3]))
    if health is not None:
        tags.append(_health_text(health, settings))
    return f"{model.title or model.name} — {model.name} · " + " · ".join(tags)


def _model_description(model: api.ImageModel, settings: core.Settings, health=None) -> str:
    parts = [model.description] if model.description else []
    if model.brand:
        parts.append(model.brand)
    if model.per_user_rpm:
        parts.append(f"{model.per_user_rpm} RPM")
    caps = [_t("model.generate", settings)]
    if model.supports_edit: caps.append(_t("model.edit", settings))
    if model.max_reference_images: caps.append(f"Refs {model.max_reference_images}")
    if model.supports_seed: caps.append("Seed")
    if model.supports_quality: caps.append("Quality")
    if model.resolutions: caps.append("/".join(model.resolutions))
    parts.append(" · ".join(caps))
    parts.append(_cost_text(model, settings))
    if health is not None:
        parts.append(_health_text(health, settings))
    return " · ".join(part for part in parts if part)


def _model_compact(model: api.ImageModel, settings: core.Settings, health=None) -> str:
    tags = [_t("model.paid", settings) if model.paid_only else _t("model.quest", settings)]
    tags.append(_t("model.community", settings) if model.community else _t("model.official", settings))
    if model.supports_edit:
        tags.append(_t("model.edit", settings))
    if health is not None:
        tags.append(_health_text(health, settings).split(" · ", 1)[0])
    return f"{model.title or model.name} · " + " · ".join(tags)


def _symbolic_icon(name: str, size=Gtk.IconSize.MENU):
    icon = Gtk.Image.new_from_icon_name(name, size)
    icon.set_valign(Gtk.Align.CENTER)
    return icon


def _badge_label(text: str, kind: str = "neutral"):
    palette = {
        "quest": ("✦", "#4fa866"),
        "paid": ("◆", "#d79a28"),
        "official": ("✓", "#5f9bd8"),
        "community": ("◇", "#a786d9"),
        "edit": ("✎", "#7aa2a8"),
        "healthy": ("●", "#4fa866"),
        "degraded": ("●", "#d79a28"),
        "offline": ("●", "#c85d5d"),
        "vision": ("◉", "#6f9fd8"),
        "tools": ("⌁", "#8a94a6"),
        "reasoning": ("◇", "#9b7fd1"),
        "neutral": ("", "#8f9399"),
    }
    icon, color = palette.get(kind, palette["neutral"])
    label = Gtk.Label(xalign=0.0, use_markup=True)
    payload = ((icon + " ") if icon else "") + str(text)
    label.set_markup(f"<span foreground='{color}'><b>{GLib.markup_escape_text(payload)}</b></span>")
    return label


def _model_browser(models, current: str, settings: core.Settings, health, *, advisor: bool = False, title: str | None = None, allow_auto: bool = True) -> str | None:
    models = list(models)
    dialog = GimpUi.Dialog(title=title or _t("browser.title", settings), role="pollinations-model-browser")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    dialog.add_button(_t("browser.select", settings), Gtk.ResponseType.OK)
    dialog.set_default_size(1040, 760)
    root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=14)

    controls = Gtk.Grid(column_spacing=8, row_spacing=6)
    search = Gtk.SearchEntry(); search.set_placeholder_text(_t("browser.search", settings)); search.set_hexpand(True)
    filt = Gtk.ComboBoxText()
    filter_keys = ("all", "quest", "paid", "official", "community", "healthy", "edit") if not advisor else ("all", "quest", "paid", "healthy", "reasoning")
    for key in filter_keys:
        filt.append(key, _t("browser.filter." + key, settings))
    filt.set_active_id("all")
    sort = Gtk.ComboBoxText()
    for key in ("auto", "cost", "latency", "name"):
        sort.append(key, _t("browser.sort." + key, settings))
    sort.set_active_id("auto")
    controls.attach(search, 0, 0, 1, 1)
    controls.attach(Gtk.Label(label=_t("browser.filter_label", settings), xalign=1.0), 1, 0, 1, 1)
    controls.attach(filt, 2, 0, 1, 1)
    controls.attach(Gtk.Label(label=_t("browser.sort_label", settings), xalign=1.0), 3, 0, 1, 1)
    controls.attach(sort, 4, 0, 1, 1)
    root.pack_start(controls, False, False, 0)

    legend = Gtk.Box(spacing=14)
    item = Gtk.Box(spacing=4); item.pack_start(_symbolic_icon("image-x-generic-symbolic"), False, False, 0); item.pack_start(Gtk.Label(label=_t("legend.image", settings)), False, False, 0); legend.pack_start(item, False, False, 0)
    legend.pack_start(_badge_label(_t("model.quest", settings), "quest"), False, False, 0)
    legend.pack_start(_badge_label(_t("model.paid", settings), "paid"), False, False, 0)
    legend.pack_start(_badge_label(_t("model.official", settings), "official"), False, False, 0)
    legend.pack_start(_badge_label(_t("model.community", settings), "community"), False, False, 0)
    root.pack_start(legend, False, False, 0)

    scroll = Gtk.ScrolledWindow(); scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC)
    listbox = Gtk.ListBox(); listbox.set_selection_mode(Gtk.SelectionMode.SINGLE); scroll.add(listbox); root.pack_start(scroll, True, True, 0)
    detail = Gtk.Label(xalign=0.0, wrap=True); detail.set_max_width_chars(120); detail.get_style_context().add_class("dim-label"); root.pack_start(detail, False, False, 0)
    rows = {}

    def model_id(m): return m.id if advisor else m.name
    def title_text(m): return m.id if advisor else (m.title or m.name)
    def health_for(m): return health.get(model_id(m))
    def matches(m):
        q = search.get_text().strip().lower()
        hay = (title_text(m) + " " + model_id(m) + " " + str(getattr(m, "description", "")) + " " + str(getattr(m, "brand", ""))).lower()
        if q and q not in hay: return False
        f = filt.get_active_id() or "all"; h = health_for(m)
        if f == "quest" and getattr(m, "paid_only", False): return False
        if f == "paid" and not getattr(m, "paid_only", False): return False
        if f == "healthy" and getattr(h, "status", None) != "on": return False
        if not advisor and f == "official" and getattr(m, "community", False): return False
        if not advisor and f == "community" and not getattr(m, "community", False): return False
        if not advisor and f == "edit" and not getattr(m, "supports_edit", False): return False
        if advisor and f == "reasoning" and not getattr(m, "reasoning", False): return False
        return True
    def sort_key(m):
        mode = sort.get_active_id() or "auto"; h = health_for(m)
        if mode == "name": return (title_text(m).lower(),)
        if mode == "cost":
            flat = getattr(m, "estimated_cost", None)
            stat = _MODEL_STATS.get(model_id(m)) if not advisor else None
            observed = getattr(stat, "avg_cost_pollen", None) if stat else None
            return (flat if isinstance(flat, (int, float)) else observed if isinstance(observed, (int, float)) else 999999.0, title_text(m).lower())
        if mode == "latency": return (getattr(h, "latency_p50_ms", None) if h and getattr(h, "latency_p50_ms", None) is not None else 999999999, title_text(m).lower())
        return (models.index(m),)
    def make_badge(text, kind="neutral"):
        return _badge_label(text, kind)
    def add_auto_row():
        if not allow_auto or not models: return
        row = Gtk.ListBoxRow(); row.model = None; row.model_id = "auto"
        box = Gtk.Box(spacing=10, margin=9); box.pack_start(_symbolic_icon("emblem-default-symbolic"), False, False, 0)
        text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=2)
        head = Gtk.Label(xalign=0.0, use_markup=True); head.set_markup(f"<b>{GLib.markup_escape_text(_t('settings.auto', settings))}</b>")
        lead = models[0]
        desc = Gtk.Label(label=_t("browser.auto_desc", settings, model=title_text(lead)), xalign=0.0, wrap=True); desc.get_style_context().add_class("dim-label")
        text.pack_start(head, False, False, 0); text.pack_start(desc, False, False, 0); box.pack_start(text, True, True, 0); row.add(box); listbox.add(row); rows["auto"] = row
    def rebuild(source=None, *_):
        # Rebuilding the list must never steal focus from the live search box.
        # Keep both focus and caret stable while the user is typing.
        search_had_focus = bool(search.has_focus()) or source is search
        search_pos = search.get_position()
        for child in list(listbox.get_children()): listbox.remove(child)
        rows.clear(); add_auto_row()
        visible = sorted([m for m in models if matches(m)], key=sort_key)
        for m in visible:
            row = Gtk.ListBoxRow(); row.model = m; row.model_id = model_id(m)
            outer = Gtk.Box(spacing=10, margin=9)
            outer.pack_start(_symbolic_icon("image-x-generic-symbolic" if not advisor else "system-search-symbolic", Gtk.IconSize.LARGE_TOOLBAR), False, False, 0)
            text = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=3)
            headbox = Gtk.Box(spacing=8)
            hlabel = Gtk.Label(xalign=0.0, use_markup=True); hlabel.set_markup(f"<b>{GLib.markup_escape_text(title_text(m))}</b>"); headbox.pack_start(hlabel, True, True, 0)
            tags = []
            if getattr(m, "paid_only", False): tags.append((_t("model.paid", settings), "paid"))
            else: tags.append((_t("model.quest", settings), "quest"))
            if not advisor:
                tags.append((_t("model.community", settings), "community") if getattr(m, "community", False) else (_t("model.official", settings), "official"))
                if getattr(m, "supports_edit", False): tags.append((_t("model.edit", settings), "edit"))
                if getattr(m, "max_reference_images", None): tags.append((f"Refs {m.max_reference_images}", "neutral"))
                if getattr(m, "supports_seed", False): tags.append(("Seed", "neutral"))
                if getattr(m, "supports_quality", False): tags.append(("Quality", "neutral"))
                cost = _cost_text(m, settings)
            else:
                tags.extend([(_t("model.vision", settings), "vision"), (_t("model.tools", settings), "tools")])
                if getattr(m, "reasoning", False): tags.append((_t("model.reasoning", settings), "reasoning"))
                cost = ""
            for tag, kind in tags: headbox.pack_start(make_badge(tag, kind), False, False, 0)
            desc_text = _advisor_description(m, settings, health_for(m)) if advisor else _model_description(m, settings, health_for(m))
            if cost and cost not in desc_text: desc_text += " · " + cost
            dlabel = Gtk.Label(label=desc_text, xalign=0.0, wrap=True); dlabel.set_max_width_chars(112); dlabel.get_style_context().add_class("dim-label")
            text.pack_start(headbox, False, False, 0); text.pack_start(dlabel, False, False, 0); outer.pack_start(text, True, True, 0); row.add(outer); listbox.add(row); rows[row.model_id] = row
        listbox.show_all()
        if current in rows:
            listbox.select_row(rows[current])
        if search_had_focus:
            def restore_search_focus():
                search.grab_focus()
                search.set_position(search_pos)
                return False
            GLib.idle_add(restore_search_focus)
        elif current in rows:
            rows[current].grab_focus()
    def selected_changed(_lb, row):
        if not row: detail.set_text(""); return
        if row.model_id == "auto":
            detail.set_text(_t("browser.auto_detail", settings, model=title_text(models[0])) if models else ""); return
        m = row.model
        detail.set_text(_advisor_description(m, settings, health_for(m)) if advisor else _model_description(m, settings, health_for(m)))
    search.connect("search-changed", rebuild); filt.connect("changed", rebuild); sort.connect("changed", rebuild); listbox.connect("row-selected", selected_changed)
    listbox.connect("row-activated", lambda _lb, _row: dialog.response(Gtk.ResponseType.OK))
    dialog.get_content_area().pack_start(root, True, True, 0); rebuild(); _present_dialog(dialog)
    response = dialog.run(); row = listbox.get_selected_row(); result = row.model_id if response == Gtk.ResponseType.OK and row else None; dialog.destroy(); return result


class _ModelPicker:
    """Browser-only model selector: no scroll-wheel accidental changes."""
    def __init__(self, models, current: str, settings: core.Settings, health, *, advisor=False, title=None, allow_auto=True, changed=None):
        self.models = list(models); self.settings = settings; self.health = health; self.advisor = advisor; self.title = title; self.allow_auto = allow_auto; self.changed = changed
        ids = {m.id if advisor else m.name for m in self.models}
        self.current = current if current in ids or (allow_auto and current == "auto") else ("auto" if allow_auto else (next(iter(ids), "")))
        self.button = Gtk.Button(); self.button.set_hexpand(True); self.button.set_always_show_image(True); self.button.set_image(_symbolic_icon("system-search-symbolic" if advisor else "image-x-generic-symbolic")); self.button.set_image_position(Gtk.PositionType.LEFT)
        self.button.connect("clicked", self._browse); self._refresh()
    def _model(self):
        if self.current == "auto": return self.models[0] if self.models else None
        return next((m for m in self.models if (m.id if self.advisor else m.name) == self.current), None)
    def _refresh(self):
        m = self._model()
        if not m: self.button.set_label(_t("settings.no_model", self.settings)); return
        name = m.id if self.advisor else (m.title or m.name)
        prefix = _t("settings.auto_short", self.settings) + " → " if self.current == "auto" else ""
        self.button.set_label(prefix + name)
        self.button.set_tooltip_text((_advisor_description(m, self.settings, self.health.get(m.id)) if self.advisor else _model_description(m, self.settings, self.health.get(m.name))))
    def _browse(self, _button):
        chosen = _model_browser(self.models, self.current, self.settings, self.health, advisor=self.advisor, title=self.title, allow_auto=self.allow_auto)
        if chosen is not None: self.set(chosen)
    def get(self): return self.current
    def set(self, value):
        old = self.current; self.current = value; self._refresh()
        if self.changed and value != old: self.changed(self)
    def widget(self): return self.button


def _advisor_description(model: api.AdvisorModel, settings: core.Settings, health=None) -> str:
    parts = []
    if model.owned_by:
        parts.append(model.owned_by)
    parts.append(_t("model.vision_tools", settings))
    if model.reasoning:
        parts.append(_t("model.reasoning", settings))
    parts.append(_t("model.paid", settings) if model.paid_only else _t("model.quest", settings))
    if health is not None:
        parts.append(_health_text(health, settings))
    return " · ".join(parts)


def _load_catalogs(token: str, settings: core.Settings | None = None, stage=None):
    settings = settings or _settings()
    stage = stage or (lambda _text: None)
    stage(_t("progress.catalog_parallel", settings))
    # Independent live sources are loaded concurrently so first-run/settings
    # latency is the slowest request, not the sum of three network requests.
    global _MODEL_STATS
    with concurrent.futures.ThreadPoolExecutor(max_workers=4, thread_name_prefix="pollinations-catalog") as pool:
        image_future = pool.submit(api.fetch_image_models, token)
        advisor_future = pool.submit(api.fetch_advisor_models, token)
        health_future = pool.submit(api.fetch_model_health, settings.health_window_minutes)
        stats_future = pool.submit(api.fetch_public_model_stats)
        image_models = image_future.result()  # authoritative auth/catalog check
        stage(_t("progress.catalog_images", settings))
        try:
            advisor_models = advisor_future.result()
            stage(_t("progress.catalog_advisor", settings))
        except api.PollinationsError:
            advisor_models = []
        try:
            health = health_future.result()
            stage(_t("progress.catalog_health", settings))
        except api.PollinationsError:
            health = {}
        try:
            _MODEL_STATS = stats_future.result()
        except Exception:
            _MODEL_STATS = {}
    stage(_t("progress.configuration_ready", settings))
    return image_models, advisor_models, health


def _progress_job(title: str, settings: core.Settings, worker, *, note_key: str = "progress.note"):
    """Run network work off the GTK thread while keeping a visible modal alive."""
    dialog = GimpUi.Dialog(title=title, role="pollinations-progress")
    _surface_dialog(dialog)
    dialog.set_default_size(600, -1)
    dialog.connect("delete-event", lambda *_args: True)
    box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=18)
    asset = Path(__file__).resolve().parent / "assets" / "pollinations-gimp-welcome.jpg"
    if asset.exists():
        try:
            pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(str(asset), 560, 190, True)
            box.pack_start(Gtk.Image.new_from_pixbuf(pix), False, False, 0)
        except Exception:
            pass
    row = Gtk.Box(spacing=12)
    spinner = Gtk.Spinner(); spinner.start()
    status = Gtk.Label(label=_t("progress.preparing", settings), xalign=0.0, wrap=True)
    row.pack_start(spinner, False, False, 0)
    row.pack_start(status, True, True, 0)
    bar = Gtk.ProgressBar(); bar.set_show_text(False)
    elapsed = Gtk.Label(label=_t("progress.elapsed", settings, seconds="0"), xalign=0.0)
    elapsed.get_style_context().add_class("dim-label")
    note = Gtk.Label(label=_t(note_key, settings), xalign=0.0, wrap=True)
    note.get_style_context().add_class("dim-label")
    box.pack_start(row, False, False, 0)
    box.pack_start(bar, False, False, 0)
    box.pack_start(elapsed, False, False, 0)
    box.pack_start(note, False, False, 0)
    dialog.get_content_area().pack_start(box, True, True, 0)
    _present_dialog(dialog)

    state = {"done": False, "result": None, "error": None}

    def set_stage(text: str):
        GLib.idle_add(status.set_text, str(text))

    def runner():
        try:
            state["result"] = worker(set_stage)
        except Exception as exc:
            state["error"] = exc
        finally:
            state["done"] = True

    started = time.monotonic()
    threading.Thread(target=runner, daemon=True).start()
    last_second = -1
    while not state["done"]:
        bar.pulse()
        second = int(time.monotonic() - started)
        if second != last_second:
            elapsed.set_text(_t("progress.elapsed", settings, seconds=str(second)))
            last_second = second
        while Gtk.events_pending():
            Gtk.main_iteration()
        time.sleep(0.08)
    while Gtk.events_pending():
        Gtk.main_iteration()
    spinner.stop()
    dialog.destroy()
    if state["error"] is not None:
        raise state["error"]
    return state["result"]


def _load_catalogs_visible(token: str, settings: core.Settings):
    return _progress_job(
        _t("progress.models", settings),
        settings,
        lambda stage: _load_catalogs(token, settings, stage),
        note_key="progress.models_note",
    )


def _confirm_fallback(exc: api.PollinationsError, fallback, settings: core.Settings) -> bool:
    dialog = Gtk.MessageDialog(
        modal=True,
        message_type=Gtk.MessageType.WARNING,
        buttons=Gtk.ButtonsType.YES_NO,
        text=_t("error.524", settings) if exc.status == 524 else str(exc),
    )
    label = getattr(fallback, 'title', None) or getattr(fallback, 'name', None) or getattr(fallback, 'id', None) or 'fallback'
    dialog.format_secondary_text(_t("fallback.ask", settings, model=label))
    _present_dialog(dialog)
    response = dialog.run()
    dialog.destroy()
    return response == Gtk.ResponseType.YES


def _run_model_request(primary, fallback, settings: core.Settings, title: str, call, *, auto_selected: bool = True):
    def attempt(model):
        return _progress_job(title, settings, lambda stage: call(model, stage))
    try:
        return attempt(primary), primary
    except api.PollinationsError as exc:
        recoverable = exc.kind in {"model_timeout", "upstream", "timeout"}
        enabled = settings.fallback_enabled and settings.fallback_mode != "off"
        if not recoverable or not enabled or fallback is None:
            raise
        # Auto selections may fail over automatically. A model explicitly chosen
        # by the user asks first unless the dedicated opt-in is enabled.
        must_ask = settings.fallback_mode == "ask" or (
            settings.fallback_mode == "automatic"
            and not auto_selected
            and not settings.allow_manual_auto_fallback
        )
        if must_ask and not _confirm_fallback(exc, fallback, settings):
            raise
        return attempt(fallback), fallback


def _welcome_dialog() -> bool:
    store = _settings_store()
    settings = store.load()
    token = _store().load()
    dialog = GimpUi.Dialog(title=_t("welcome.title", settings), role="pollinations-welcome")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    dialog.add_button(_t("welcome.continue", settings) if token else _t("welcome.connect", settings), Gtk.ResponseType.OK if token else RESPONSE_CONNECT)
    dialog.set_default_size(900, 720)

    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14, margin=16)
    asset = Path(__file__).resolve().parent / "assets" / "pollinations-gimp-welcome.jpg"
    if asset.exists():
        try:
            pix = GdkPixbuf.Pixbuf.new_from_file_at_scale(str(asset), 860, 390, True)
            image = Gtk.Image.new_from_pixbuf(pix)
            outer.pack_start(image, False, False, 0)
        except Exception:
            pass

    title = Gtk.Label(xalign=0.5, use_markup=True)
    title.set_markup(f"<span size='xx-large' weight='bold'>{GLib.markup_escape_text(_t('welcome.title', settings))}</span>")
    subtitle = Gtk.Label(label=_t("welcome.subtitle", settings), xalign=0.5, wrap=True)
    subtitle.set_max_width_chars(96)
    outer.pack_start(title, False, False, 0)
    outer.pack_start(subtitle, False, False, 0)

    steps = Gtk.Label(xalign=0.5, use_markup=True)
    steps.set_markup(GLib.markup_escape_text(_t("welcome.steps", settings)))
    steps.get_style_context().add_class("dim-label")
    outer.pack_start(steps, False, False, 0)

    cards = Gtk.Box(spacing=10, homogeneous=True)
    for icon, heading_key, text_key in (
        ("✨", "welcome.card_generate", "welcome.card_generate_text"),
        ("✏", "welcome.card_edit", "welcome.card_edit_text"),
        ("✂", "welcome.card_separate", "welcome.card_separate_text"),
    ):
        frame = Gtk.Frame()
        card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin=12)
        head = Gtk.Label(xalign=0.0, use_markup=True)
        head.set_markup(f"<b>{GLib.markup_escape_text(icon + '  ' + _t(heading_key, settings))}</b>")
        body = Gtk.Label(label=_t(text_key, settings), xalign=0.0, yalign=0.0, wrap=True)
        body.set_max_width_chars(31)
        card.pack_start(head, False, False, 0); card.pack_start(body, True, True, 0)
        frame.add(card); cards.pack_start(frame, True, True, 0)
    outer.pack_start(cards, False, False, 0)

    capabilities = Gtk.Label(label=_t("welcome.capabilities", settings), xalign=0.5, wrap=True)
    capabilities.set_max_width_chars(100)
    capabilities.get_style_context().add_class("dim-label")
    privacy = Gtk.Label(label=_t("welcome.privacy", settings), xalign=0.5, wrap=True)
    privacy.set_max_width_chars(100)
    privacy.get_style_context().add_class("dim-label")
    outer.pack_start(capabilities, False, False, 0)
    outer.pack_start(privacy, False, False, 0)

    dialog.get_content_area().pack_start(outer, True, True, 0)
    _present_dialog(dialog)
    response = dialog.run()
    dialog.destroy()
    if response == Gtk.ResponseType.CANCEL:
        return False
    if response == RESPONSE_CONNECT:
        try:
            if not _connect_account(settings):
                return False
        except Exception as exc:
            _show_error(exc)
            return False
    # The onboarding only completes after a successful connection (or an
    # already-existing delegated token), then immediately opens Settings.
    if not _store().load():
        return False
    settings = store.load()
    settings.onboarding_done = True
    settings.first_run_done = True
    store.save(settings)
    return _settings_dialog()


def _about_dialog() -> bool:
    settings = _settings(); token = _store().load(); snapshot = _account_snapshot(token)
    dialog = GimpUi.Dialog(title=_t("about.title", settings), role="pollinations-about"); _surface_dialog(dialog)
    dialog.add_button(_t("about.replay", settings), RESPONSE_REPLAY); dialog.add_button(_t("button.close", settings), Gtk.ResponseType.CLOSE)
    dialog.set_default_size(900, 720)
    outer = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=14, margin=16)
    asset = Path(__file__).resolve().parent / "assets" / "pollinations-gimp-welcome.jpg"
    if asset.exists():
        try: outer.pack_start(Gtk.Image.new_from_pixbuf(GdkPixbuf.Pixbuf.new_from_file_at_scale(str(asset), 860, 360, True)), False, False, 0)
        except Exception: pass
    title = Gtk.Label(xalign=0.5, use_markup=True); title.set_markup(f"<span size='xx-large' weight='bold'>{GLib.markup_escape_text(_t('welcome.title', settings))}</span>"); outer.pack_start(title, False, False, 0)
    version = Gtk.Label(xalign=0.5, use_markup=True); version.set_markup(f"<b>Pollinations AI for GIMP · v{GLib.markup_escape_text(PLUGIN_VERSION)}</b>"); outer.pack_start(version, False, False, 0)
    identity = Gtk.Label(label=("● " + _account_identity(snapshot, settings)), xalign=0.5); identity.get_style_context().add_class("dim-label"); outer.pack_start(identity, False, False, 0)
    subtitle = Gtk.Label(label=_t("welcome.subtitle", settings), xalign=0.5, wrap=True); subtitle.set_max_width_chars(96); outer.pack_start(subtitle, False, False, 0)
    cards = Gtk.Box(spacing=10, homogeneous=True)
    for heading_key, text_key in (("welcome.card_generate","welcome.card_generate_text"),("welcome.card_edit","welcome.card_edit_text"),("welcome.card_separate","welcome.card_separate_text")):
        frame = Gtk.Frame(); card = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=6, margin=12)
        head = Gtk.Label(xalign=0.0, use_markup=True); head.set_markup(f"<b>{GLib.markup_escape_text(_t(heading_key, settings))}</b>")
        body = Gtk.Label(label=_t(text_key, settings), xalign=0.0, yalign=0.0, wrap=True); body.set_max_width_chars(31)
        card.pack_start(head, False, False, 0); card.pack_start(body, True, True, 0); frame.add(card); cards.pack_start(frame, True, True, 0)
    outer.pack_start(cards, False, False, 0)
    caps = Gtk.Label(label=_t("welcome.capabilities", settings), xalign=0.5, wrap=True); caps.set_max_width_chars(100); caps.get_style_context().add_class("dim-label"); outer.pack_start(caps, False, False, 0)
    dialog.get_content_area().pack_start(outer, True, True, 0); _present_dialog(dialog); response = dialog.run(); dialog.destroy()
    if response == RESPONSE_REPLAY:
        return _welcome_dialog()
    return True


def _run_about(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_ABOUT)
    try: return _success(procedure) if _about_dialog() else _cancel(procedure)
    except Exception as exc: return _execution_error(procedure, exc)


def _settings_dialog() -> bool:
    settings_store = _settings_store()
    settings = settings_store.load()
    token = _store().load()
    image_models: list[api.ImageModel] = []
    advisor_models: list[api.AdvisorModel] = []
    health = {}
    if token:
        try:
            image_models, advisor_models, health = _progress_job(
                _t("progress.configuration", settings),
                settings,
                lambda stage: _load_catalogs(token, settings, stage),
                note_key="progress.configuration_note",
            )
        except api.PollinationsError as exc:
            if exc.kind == "auth":
                _store().clear(); token = None
            else:
                _show_error(exc)

    dialog = GimpUi.Dialog(title=_t("settings.title", settings), role="pollinations-settings")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    dialog.add_button(_t("button.save", settings), Gtk.ResponseType.OK)
    dialog.set_default_size(1040, 800)
    root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=12)
    asset = Path(__file__).resolve().parent / "assets" / "pollinations-gimp-welcome.jpg"
    if asset.exists():
        try:
            hero = GdkPixbuf.Pixbuf.new_from_file_at_scale(str(asset), 1000, 150, True)
            root.pack_start(Gtk.Image.new_from_pixbuf(hero), False, False, 0)
        except Exception:
            pass
    account = Gtk.Box(spacing=8)
    snapshot = _account_snapshot(token)
    account_text = _account_identity(snapshot, settings)
    visible_balance = (snapshot.get("balance") or {}).get("balance")
    if isinstance(visible_balance, (int, float)):
        account_text += f" · {_human_pollen(float(visible_balance))}"
    status = Gtk.Label(xalign=0.0, use_markup=True)
    status_color = "#4fa866" if token else "#c85d5d"
    status.set_markup(f"<span foreground='{status_color}'><b>● {GLib.markup_escape_text(account_text)}</b></span>")
    account.pack_start(status, True, True, 0)
    refresh_btn = Gtk.Button(label=_t("settings.refresh", settings)); refresh_btn.connect("clicked", lambda _b: dialog.response(RESPONSE_REFRESH)); account.pack_start(refresh_btn, False, False, 0)
    state_btn = Gtk.Button(label=_t("menu.disconnect", settings) if token else _t("menu.connect", settings))
    state_btn.connect("clicked", lambda _b: dialog.response(RESPONSE_DISCONNECT if token else RESPONSE_CONNECT)); account.pack_start(state_btn, False, False, 0)
    root.pack_start(account, False, False, 0)
    notebook = Gtk.Notebook(); root.pack_start(notebook, True, True, 0)

    ranked_gen = core.sorted_image_models(image_models, "generation", prefer_official=settings.prefer_official_models, prefer_quest=settings.prefer_quest_models, include_community=settings.include_community_models, health_by_name=health)
    ranked_edit = core.sorted_image_models(image_models, "edit", prefer_official=settings.prefer_official_models, prefer_quest=settings.prefer_quest_models, include_community=settings.include_community_models, health_by_name=health)
    ranked_adv = core.sorted_advisor_models(advisor_models, health)

    def grid_page(rows):
        grid = Gtk.Grid(column_spacing=12, row_spacing=10, margin=14)
        for idx, (label, widget) in enumerate(rows):
            grid.attach(Gtk.Label(label=label, xalign=1.0), 0, idx, 1, 1)
            grid.attach(widget, 1, idx, 1, 1)
        return grid

    models_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=12)
    auto_summary = Gtk.Label(xalign=0.0, wrap=True, use_markup=True)
    auto_gen = ranked_gen[0] if ranked_gen else None
    auto_gen_fb = ranked_gen[1] if len(ranked_gen) > 1 else None
    auto_edit = ranked_edit[0] if ranked_edit else None
    auto_edit_fb = ranked_edit[1] if len(ranked_edit) > 1 else None
    auto_adv = ranked_adv[0] if ranked_adv else None
    summary_lines = [f"<b>{GLib.markup_escape_text(_t('settings.live_auto', settings))}</b>"]
    if auto_gen: summary_lines.append(f"{GLib.markup_escape_text(_t('settings.gen_model', settings))}: {GLib.markup_escape_text(auto_gen.title or auto_gen.name)} · {GLib.markup_escape_text(_cost_text(auto_gen, settings))}")
    if auto_gen_fb: summary_lines.append(f"{GLib.markup_escape_text(_t('settings.gen_fallback', settings))}: {GLib.markup_escape_text(auto_gen_fb.title or auto_gen_fb.name)}")
    if auto_edit: summary_lines.append(f"{GLib.markup_escape_text(_t('settings.edit_model', settings))}: {GLib.markup_escape_text(auto_edit.title or auto_edit.name)} · {GLib.markup_escape_text(_cost_text(auto_edit, settings))}")
    if auto_edit_fb: summary_lines.append(f"{GLib.markup_escape_text(_t('settings.edit_fallback', settings))}: {GLib.markup_escape_text(auto_edit_fb.title or auto_edit_fb.name)}")
    if auto_adv: summary_lines.append(f"{GLib.markup_escape_text(_t('settings.advisor_model', settings))}: {GLib.markup_escape_text(auto_adv.id)}")
    auto_summary.set_markup("\n".join(summary_lines)); models_box.pack_start(auto_summary, False, False, 0)
    live_note = Gtk.Label(label=_t("settings.browser_only_note", settings), xalign=0.0, wrap=True); live_note.get_style_context().add_class("dim-label"); models_box.pack_start(live_note, False, False, 0)

    gen_model = _ModelPicker(ranked_gen, settings.generation_model, settings, health, title=_t("browser.image_title", settings))
    gen_fb = _ModelPicker(ranked_gen, settings.generation_fallback_model, settings, health, title=_t("browser.image_title", settings))
    edit_model = _ModelPicker(ranked_edit, settings.edit_model, settings, health, title=_t("browser.image_title", settings))
    edit_fb = _ModelPicker(ranked_edit, settings.edit_fallback_model, settings, health, title=_t("browser.image_title", settings))
    advisor_model = _ModelPicker(ranked_adv, settings.advisor_model, settings, health, advisor=True, title=_t("browser.advisor_title", settings))
    advisor_fb = _ModelPicker(ranked_adv, settings.advisor_fallback_model, settings, health, advisor=True, title=_t("browser.advisor_title", settings))

    def role_frame(title_text, primary_label, primary_picker, fallback_label_text, fallback_picker, primary_models, advisor=False):
        frame = Gtk.Frame(label=title_text)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin=10)
        grid = Gtk.Grid(column_spacing=10, row_spacing=8)
        grid.attach(Gtk.Label(label=primary_label, xalign=1.0), 0, 0, 1, 1); grid.attach(primary_picker.widget(), 1, 0, 1, 1)
        grid.attach(Gtk.Label(label=fallback_label_text, xalign=1.0), 0, 1, 1, 1); grid.attach(fallback_picker.widget(), 1, 1, 1, 1)
        detail = Gtk.Label(xalign=0.0, wrap=True); detail.set_max_width_chars(105); detail.get_style_context().add_class("dim-label")
        by_id = {(m.id if advisor else m.name): m for m in primary_models}
        def refresh(*_):
            mid = primary_picker.get(); m = primary_models[0] if mid == "auto" and primary_models else by_id.get(mid)
            if not m: detail.set_text(_t("settings.no_model", settings)); return
            prefix = _t("settings.auto_detail", settings) + ": " if mid == "auto" else ""
            text = _advisor_description(m, settings, health.get(m.id)) if advisor else _model_description(m, settings, health.get(m.name))
            detail.set_text(prefix + text)
        primary_picker.changed = refresh; refresh()
        box.pack_start(grid, False, False, 0); box.pack_start(detail, False, False, 0); frame.add(box); return frame

    models_box.pack_start(role_frame(_t("settings.role_generation", settings), _t("settings.gen_model", settings), gen_model, _t("settings.gen_fallback", settings), gen_fb, ranked_gen), False, False, 0)
    models_box.pack_start(role_frame(_t("settings.role_edit", settings), _t("settings.edit_model", settings), edit_model, _t("settings.edit_fallback", settings), edit_fb, ranked_edit), False, False, 0)
    advisor_frame = role_frame(_t("settings.role_advisor", settings), _t("settings.advisor_model", settings), advisor_model, _t("settings.advisor_fallback", settings), advisor_fb, ranked_adv, advisor=True)
    advisor_frame.set_sensitive(settings.advisor_enabled); models_box.pack_start(advisor_frame, False, False, 0)
    models_scroll = Gtk.ScrolledWindow(); models_scroll.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC); models_scroll.add(models_box)
    notebook.append_page(models_scroll, Gtk.Label(label=_t('tab.models', settings)))

    destination = Gtk.ComboBoxText(); destination.append("image", _t("dest.image", settings)); destination.append("layer", _t("dest.layer", settings)); destination.set_active_id(settings.default_destination)
    fallback_mode = Gtk.ComboBoxText(); fallback_mode.append("off", _t("fallback.off", settings)); fallback_mode.append("ask", _t("fallback.ask_mode", settings)); fallback_mode.append("automatic", _t("fallback.automatic", settings)); fallback_mode.set_active_id(settings.fallback_mode)
    padding = Gtk.SpinButton.new_with_range(0, 200, 5); padding.set_value(settings.context_padding_percent)
    health_window = Gtk.ComboBoxText()
    for n, label in ((5,"5 min"),(60,"60 min"),(240,"4 h"),(1440,"24 h")): health_window.append(str(n), label)
    health_window.set_active_id(str(settings.health_window_minutes) if settings.health_window_minutes in {5,60,240,1440} else "60")
    behavior_grid = grid_page([
        (_t("settings.destination", settings), destination),
        (_t("settings.fallback_mode", settings), fallback_mode),
        (_t("settings.health_window", settings), health_window),
        (_t("label.context", settings) + " (%)", padding),
    ])
    behavior_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=8, margin=8); behavior_box.pack_start(behavior_grid, False, False, 0)
    checks = {}
    for key, value in (
        ("fallback", settings.fallback_enabled), ("manual_auto_fallback", settings.allow_manual_auto_fallback), ("prefer_quest", settings.prefer_quest_models),
        ("advisor_enabled", settings.advisor_enabled), ("show_desc", settings.show_model_descriptions), ("prefer_official", settings.prefer_official_models),
        ("community", settings.include_community_models), ("preserve", settings.preserve_original), ("group", settings.group_separation_outputs),
    ):
        widget = Gtk.CheckButton(label=_t("settings." + key, settings)); widget.set_active(value); checks[key] = widget; behavior_box.pack_start(widget, False, False, 0)
    def advisor_enabled_changed(widget):
        enabled = widget.get_active(); advisor_frame.set_sensitive(enabled)
    checks["advisor_enabled"].connect("toggled", advisor_enabled_changed)
    notebook.append_page(behavior_box, Gtk.Label(label=_t('tab.behavior', settings)))

    rmbg_provider = Gtk.ComboBoxText()
    rmbg_provider.append("clearbackdrop", _t("rmbg.clearbackdrop", settings))
    rmbg_provider.append("off", _t("rmbg.off", settings))
    rmbg_provider.set_active_id(settings.rmbg_provider if settings.rmbg_provider in {"clearbackdrop", "off"} else "clearbackdrop")
    rmbg_use = Gtk.CheckButton(label=_t("settings.rmbg_separation", settings)); rmbg_use.set_active(settings.rmbg_use_in_separation)
    rmbg_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=14)
    rmbg_box.pack_start(grid_page([(_t("settings.rmbg", settings), rmbg_provider)]), False, False, 0)
    rmbg_box.pack_start(rmbg_use, False, False, 0)
    try:
        q = api.clearbackdrop_quota(); qtext = _t("settings.rmbg_quota", settings, remaining=q.get("remaining") if q.get("remaining") is not None else "?", limit=q.get("limit") if q.get("limit") is not None else "?")
    except Exception:
        qtext = _t("rmbg.quota_unavailable", settings)
    rmbg_box.pack_start(Gtk.Label(label=qtext, xalign=0.0), False, False, 0)
    provider_help = Gtk.Label(label=_t("rmbg.pr_help", settings), xalign=0.0, wrap=True); provider_help.set_max_width_chars(90); provider_help.get_style_context().add_class("dim-label"); rmbg_box.pack_start(provider_help, False, False, 0)
    privacy = Gtk.Label(label=_t("welcome.privacy", settings), xalign=0.0, wrap=True); privacy.set_max_width_chars(90); rmbg_box.pack_start(privacy, False, False, 0)
    notebook.append_page(rmbg_box, Gtk.Label(label=_t('tab.rmbg', settings)))

    language = Gtk.ComboBoxText(); language.append("system", "System")
    for code, label in (("en","English"),("fr","Français"),("es","Español"),("de","Deutsch"),("it","Italiano"),("zh","中文")): language.append(code, label)
    language.set_active_id(settings.language if settings.language in {"system", *i18n.SUPPORTED} else "system")
    notebook.append_page(grid_page([(_t("label.language", settings), language)]), Gtk.Label(label=_t('tab.language', settings)))

    root.pack_start(Gtk.Label(label=_t("settings.restart", settings), xalign=0.0, wrap=True), False, False, 0)
    dialog.get_content_area().pack_start(root, True, True, 0); _present_dialog(dialog)
    response = dialog.run()
    if response == RESPONSE_CONNECT:
        dialog.destroy()
        try: _connect_account(settings)
        except Exception as exc: _show_error(exc)
        return _settings_dialog()
    if response == RESPONSE_DISCONNECT:
        _store().clear(); dialog.destroy(); return _settings_dialog()
    if response == RESPONSE_REFRESH:
        dialog.destroy(); return _settings_dialog()
    if response != Gtk.ResponseType.OK:
        dialog.destroy(); return False

    settings.language = language.get_active_id() or "system"
    settings.generation_model = gen_model.get() or "auto"; settings.generation_fallback_model = gen_fb.get() or "auto"
    settings.edit_model = edit_model.get() or "auto"; settings.edit_fallback_model = edit_fb.get() or "auto"
    settings.advisor_model = advisor_model.get() or "auto"; settings.advisor_fallback_model = advisor_fb.get() or "auto"
    settings.default_destination = destination.get_active_id() or "image"; settings.fallback_mode = fallback_mode.get_active_id() or "ask"
    settings.health_window_minutes = int(health_window.get_active_id() or 60); settings.context_padding_percent = int(padding.get_value())
    settings.fallback_enabled = checks["fallback"].get_active(); settings.allow_manual_auto_fallback = checks["manual_auto_fallback"].get_active(); settings.prefer_quest_models = checks["prefer_quest"].get_active()
    settings.advisor_enabled = checks["advisor_enabled"].get_active(); settings.review_with_context = False; settings.show_model_descriptions = checks["show_desc"].get_active(); settings.prefer_official_models = checks["prefer_official"].get_active()
    settings.include_community_models = checks["community"].get_active(); settings.preserve_original = checks["preserve"].get_active(); settings.group_separation_outputs = checks["group"].get_active()
    settings.rmbg_provider = rmbg_provider.get_active_id() or "clearbackdrop"; settings.rmbg_use_in_separation = rmbg_use.get_active(); settings.onboarding_done = True; settings.first_run_done = True
    dialog.destroy(); settings_store.save(settings); return True


def _ensure_onboarding() -> bool:
    settings = _settings_store().load()
    return True if settings.onboarding_done else _welcome_dialog()


def _run_settings(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_SETTINGS)
    try:
        settings = _settings_store().load()
        if not settings.onboarding_done:
            return _success(procedure) if _welcome_dialog() else _cancel(procedure)
        return _success(procedure) if _settings_dialog() else _cancel(procedure)
    except Exception as exc: return _execution_error(procedure, exc)


def _context_metadata(image, task: str, operation: str | None = None) -> dict:
    bbox = _selection_bbox(image)
    return {"task": task, "operation": operation, "image_width": int(image.get_width()) if image else None, "image_height": int(image.get_height()) if image else None, "selection_bbox": list(bbox) if bbox else None}


def _advisor_review(token, settings, advisors, models, health, *, prompt, task, image=None, operation=None, advisor_override: str | None = None):
    advisor_choice = advisor_override or settings.advisor_model
    advisor = core.pick_advisor_model(advisors, advisor_choice, health)
    if advisor is None: raise api.PollinationsError("bad_request", _t("advisor.none", settings))
    fallback = core.pick_advisor_fallback(advisors, settings.advisor_fallback_model, advisor, health)
    preview = None
    if image is not None:
        bbox = _selection_bbox(image)
        preview = _export_composite_png(image, _expanded_bbox(image, bbox, settings.context_padding_percent), max_dim=1024) if bbox and task in {"selection_patch","add","replace","remove","separate","context"} else _export_composite_png(image, max_dim=1024)
    def invoke(model, stage):
        stage(_t("progress.sending", settings, model=model.id)); stage(_t("progress.waiting", settings, model=model.id))
        return api.review_prompt(token, model.id, prompt=prompt, task=task, candidate_models=models, language=_lang(settings), image_bytes=preview, context=_context_metadata(image, task, operation), cost_estimates={m.name:_estimated_cost_value(m) for m in models if _estimated_cost_value(m) is not None})
    return _run_model_request(advisor, fallback, settings, _t("progress.review", settings, model=advisor.id), invoke, auto_selected=advisor_choice == "auto")[0]



def _separate_dialog(image_models, health, *, image, initial=None):
    """Magic Separate controls only the background reconstruction model.

    ClearBackdrop is deterministic and accepts no text prompt. The Vision
    Advisor is intentionally absent here: it cannot improve segmentation and
    must not redirect the reconstruction workflow.
    """
    settings = _settings()
    initial = initial or {}
    ranked = core.sorted_image_models(
        image_models,
        "separate",
        prefer_official=settings.prefer_official_models,
        prefer_quest=settings.prefer_quest_models,
        include_community=settings.include_community_models,
        health_by_name=health,
    )
    if not ranked:
        raise api.PollinationsError("bad_request", _t("error.no_models", settings))

    configured = settings.edit_model
    previous_name = getattr(initial.get("model"), "name", None)
    if initial.get("auto_selected"):
        initial_model = "auto"
    elif previous_name and any(m.name == previous_name for m in ranked):
        initial_model = previous_name
    else:
        initial_model = configured if configured != "auto" and any(m.name == configured for m in ranked) else "auto"
    picker = _ModelPicker(ranked, initial_model, settings, health, title=_t("browser.image_title", settings))

    dialog = GimpUi.Dialog(title=_t("menu.separate", settings), role="pollinations-magic-separate")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    dialog.add_button(_t("button.apply", settings), Gtk.ResponseType.OK)
    dialog.set_default_size(820, 500)
    root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=16)

    intro = Gtk.Label(xalign=0.0, wrap=True, use_markup=True)
    intro.set_markup(
        f"<b>{GLib.markup_escape_text(_t('menu.separate', settings))}</b>\n"
        f"{GLib.markup_escape_text(_t('separate.no_prompt_help', settings))}"
    )
    intro.set_max_width_chars(100)
    root.pack_start(intro, False, False, 0)

    grid = Gtk.Grid(column_spacing=12, row_spacing=10)
    grid.attach(Gtk.Label(label=_t("separate.reconstruction_model", settings), xalign=1.0), 0, 0, 1, 1)
    grid.attach(picker.widget(), 1, 0, 1, 1)

    resolution = Gtk.ComboBoxText()
    resolution_label = Gtk.Label(label=_t("label.resolution", settings), xalign=1.0)
    grid.attach(resolution_label, 0, 1, 1, 1); grid.attach(resolution, 1, 1, 1, 1)
    seed = Gtk.SpinButton.new_with_range(-1, 2147483647, 1); seed.set_value(initial.get("seed") if initial.get("seed") is not None else -1)
    seed_label = Gtk.Label(label=_t("label.seed", settings), xalign=1.0)
    grid.attach(seed_label, 0, 2, 1, 1); grid.attach(seed, 1, 2, 1, 1)
    quality = Gtk.ComboBoxText()
    for value in ("low", "medium", "high"): quality.append(value, value.title())
    quality.set_active_id(initial.get("quality") or "medium")
    quality_label = Gtk.Label(label=_t("label.quality", settings), xalign=1.0)
    grid.attach(quality_label, 0, 3, 1, 1); grid.attach(quality, 1, 3, 1, 1)
    root.pack_start(grid, False, False, 0)

    detail = Gtk.Label(xalign=0.0, wrap=True); detail.set_max_width_chars(100); detail.get_style_context().add_class("dim-label")
    cost_label = Gtk.Label(xalign=0.0, wrap=True, use_markup=True)
    root.pack_start(detail, False, False, 0); root.pack_start(cost_label, False, False, 0)

    by_name = {m.name: m for m in ranked}
    current_cost = {"value": None, "text": ""}
    def effective_model():
        return ranked[0] if picker.get() == "auto" else by_name.get(picker.get(), ranked[0])
    def update_cost(*_):
        m = effective_model()
        w = int(image.get_width()) if image is not None else 1024
        h = int(image.get_height()) if image is not None else 1024
        text, value = _request_cost(m, settings, has_image=True, width=w, height=h, resolution=resolution.get_active_id(), quality=quality.get_active_id())
        text += " · " + _t("cost.plus_free_rmbg", settings)
        current_cost["text"] = text; current_cost["value"] = value
        cost_label.set_markup(f"<b>{GLib.markup_escape_text(_t('cost.before_run', settings))}</b>  {GLib.markup_escape_text(text)}")
    def update_model(*_):
        m = effective_model(); previous = resolution.get_active_id(); resolution.remove_all()
        if m.resolutions:
            for value in m.resolutions: resolution.append(value, value.upper())
            resolution.set_active_id(previous if previous in m.resolutions else m.resolutions[0]); resolution_label.show(); resolution.show()
        else:
            resolution_label.hide(); resolution.hide()
        seed_label.set_visible(m.supports_seed); seed.set_visible(m.supports_seed)
        quality_label.set_visible(m.supports_quality); quality.set_visible(m.supports_quality)
        selection_note = _t("separate.selection_hint", settings) if _selection_bbox(image) else _t("separate.no_selection_hint", settings)
        model_text = _model_description(m, settings, health.get(m.name)) if settings.show_model_descriptions else ""
        detail.set_text(selection_note + ("\n" + model_text if model_text else ""))
        update_cost()
    picker.changed = update_model
    resolution.connect("changed", update_cost); quality.connect("changed", update_cost)

    dialog.get_content_area().pack_start(root, True, True, 0); _present_dialog(dialog); update_model()
    if initial.get("resolution"):
        resolution.set_active_id(initial["resolution"])
    update_cost()
    response = dialog.run()
    if response != Gtk.ResponseType.OK:
        dialog.destroy(); return None
    m = effective_model()
    result = {
        "prompt": "",
        "model": m,
        "advisor_id": None,
        "auto_selected": picker.get() == "auto",
        "width": None, "height": None, "size": None,
        "resolution": resolution.get_active_id() if m.resolutions else None,
        "seed": None if (not m.supports_seed or int(seed.get_value()) < 0) else int(seed.get_value()),
        "quality": quality.get_active_id() if m.supports_quality else None,
        "transparent": False, "destination": "layer", "mode": None, "operation": None,
        "padding": settings.context_padding_percent,
        "advisor_reviewed": False, "advisor_applied": False, "advisor_applied_mode": "none",
        "advisor_suggested_model": None,
        "estimated_cost_pollen": current_cost["value"], "estimated_cost_text": current_cost["text"],
    }
    dialog.destroy(); return result

def _action_dialog(token, image_models, advisor_models, health, *, image, task: str, forced_destination: str | None = None, initial=None):
    initial = initial or {}
    if task == "separate":
        return _separate_dialog(image_models, health, image=image, initial=initial)
    settings = _settings()
    rank_task = "generation" if task == "generation" else "separate" if task == "separate" else "context" if task == "context" else "edit"
    ranked = core.sorted_image_models(image_models, rank_task, prefer_official=settings.prefer_official_models, prefer_quest=settings.prefer_quest_models, include_community=settings.include_community_models, health_by_name=health)
    if not ranked:
        raise api.PollinationsError("bad_request", _t("error.no_models", settings))
    configured = settings.generation_model if task == "generation" else settings.edit_model
    recommended = core.pick_image_model(ranked, rank_task, configured, settings, health) or ranked[0]
    fallback_cfg = settings.generation_fallback_model if task == "generation" else settings.edit_fallback_model
    title = {"generation": _t("menu.generate", settings), "edit": _t("menu.edit", settings), "context": _t("menu.context", settings), "separate": _t("menu.separate", settings)}[task]

    dialog = GimpUi.Dialog(title=title, role="pollinations-action")
    _surface_dialog(dialog)
    dialog.add_button(_t("button.cancel", settings), Gtk.ResponseType.CANCEL)
    if settings.advisor_enabled and advisor_models:
        dialog.add_button(_t("button.review", settings), RESPONSE_REVIEW)
    dialog.add_button(_t("button.generate" if task == "generation" else "button.apply", settings), Gtk.ResponseType.OK)
    dialog.set_default_size(960, 760)
    root = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=10, margin=14)
    grid = Gtk.Grid(column_spacing=12, row_spacing=10)
    row = 0

    def attach(label, widget):
        nonlocal row
        grid.attach(Gtk.Label(label=label, xalign=1.0, yalign=0.2), 0, row, 1, 1)
        grid.attach(widget, 1, row, 1, 1)
        row += 1

    previous_name = getattr(initial.get("model"), "name", None)
    if initial.get("auto_selected"):
        initial_model = "auto"
    elif previous_name and any(m.name == previous_name for m in ranked):
        initial_model = previous_name
    else:
        initial_model = configured if configured != "auto" and any(m.name == configured for m in ranked) else "auto"
    model_picker = _ModelPicker(ranked, initial_model, settings, health, title=_t("browser.image_title", settings))
    attach(_t("label.model", settings), model_picker.widget())

    ranked_action_adv = core.sorted_advisor_models(advisor_models, health) if settings.advisor_enabled else []
    previous_advisor = initial.get("advisor_id")
    advisor_initial = previous_advisor if previous_advisor and (previous_advisor == "auto" or any(a.id == previous_advisor for a in ranked_action_adv)) else (settings.advisor_model if settings.advisor_model == "auto" or any(a.id == settings.advisor_model for a in ranked_action_adv) else "auto")
    advisor_picker = _ModelPicker(ranked_action_adv, advisor_initial, settings, health, advisor=True, title=_t("browser.advisor_title", settings))
    if ranked_action_adv:
        attach(_t("label.vision_tool", settings), advisor_picker.widget())

    prompt_scroll = Gtk.ScrolledWindow(); prompt_scroll.set_policy(Gtk.PolicyType.NEVER, Gtk.PolicyType.AUTOMATIC); prompt_scroll.set_min_content_height(112)
    prompt_view = Gtk.TextView(); prompt_view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR); prompt_view.set_left_margin(8); prompt_view.set_right_margin(8); prompt_view.set_top_margin(6); prompt_view.set_bottom_margin(6)
    prompt_scroll.add(prompt_view); attach(_t("separate.target", settings) if task == "separate" else _t("label.prompt", settings), prompt_scroll)
    prompt_buffer = prompt_view.get_buffer()
    def prompt_get():
        a, b = prompt_buffer.get_bounds(); return prompt_buffer.get_text(a, b, True).strip()
    def prompt_set(value): prompt_buffer.set_text(str(value or ""))
    prompt_set(initial.get("prompt", ""))

    mode_combo = operation_combo = None
    if task == "edit":
        mode_combo = Gtk.ComboBoxText(); mode_combo.append("full_edit", _t("edit.full", settings))
        if _selection_bbox(image):
            mode_combo.append("selection_patch", _t("edit.selection", settings))
            mode_combo.set_active_id(initial.get("mode") if initial.get("mode") in {"full_edit", "selection_patch"} else "selection_patch")
        else:
            mode_combo.set_active_id("full_edit")
        attach(_t("label.operation", settings), mode_combo)
    elif task == "context":
        operation_combo = Gtk.ComboBoxText()
        for key in ("add", "replace", "remove"): operation_combo.append(key, _t("op." + key, settings))
        operation_combo.set_active_id(initial.get("operation") if initial.get("operation") in {"add", "replace", "remove"} else "add"); attach(_t("label.operation", settings), operation_combo)

    aspect = width = height = None
    if task == "generation":
        aspect = Gtk.ComboBoxText()
        if image is not None: aspect.append("source", f"{_t('size.source', settings)} — {image.get_width()}×{image.get_height()}")
        for name, w, h in core.ASPECT_PRESETS: aspect.append(name, f"{name} — {w}×{h}")
        aspect.append("custom", _t("size.custom", settings)); aspect.set_active_id("source" if image is not None else "1:1"); attach(_t("label.aspect", settings), aspect)
        dims_box = Gtk.Box(spacing=8); width = Gtk.SpinButton.new_with_range(256, 4096, 64); height = Gtk.SpinButton.new_with_range(256, 4096, 64); width.set_value(initial.get("width") or (image.get_width() if image else 1024)); height.set_value(initial.get("height") or (image.get_height() if image else 1024))
        dims_box.pack_start(Gtk.Label(label="W"), False, False, 0); dims_box.pack_start(width, True, True, 0); dims_box.pack_start(Gtk.Label(label="H"), False, False, 0); dims_box.pack_start(height, True, True, 0); attach(_t("label.size", settings), dims_box)
        def aspect_changed(_combo):
            aid = aspect.get_active_id()
            if aid == "source" and image is not None: w, h = int(image.get_width()), int(image.get_height())
            else:
                found = next(((w, h) for n, w, h in core.ASPECT_PRESETS if n == aid), None)
                if not found: return
                w, h = found
            width.set_value(w); height.set_value(h)
        aspect.connect("changed", aspect_changed); aspect_changed(aspect)
        if initial.get("width") and initial.get("height"):
            iw, ih = int(initial["width"]), int(initial["height"])
            desired = None
            if image is not None and iw == int(image.get_width()) and ih == int(image.get_height()):
                desired = "source"
            else:
                desired = next((name for name, w, h in core.ASPECT_PRESETS if w == iw and h == ih), "custom")
            aspect.set_active_id(desired)
            width.set_value(iw); height.set_value(ih)

    resolution = Gtk.ComboBoxText(); resolution_label = Gtk.Label(label=_t("label.resolution", settings), xalign=1.0); grid.attach(resolution_label, 0, row, 1, 1); grid.attach(resolution, 1, row, 1, 1); row += 1
    seed = Gtk.SpinButton.new_with_range(-1, 2147483647, 1); seed.set_value(initial.get("seed") if initial.get("seed") is not None else -1); seed_label = Gtk.Label(label=_t("label.seed", settings), xalign=1.0); grid.attach(seed_label, 0, row, 1, 1); grid.attach(seed, 1, row, 1, 1); row += 1
    quality = Gtk.ComboBoxText(); [quality.append(v, v.title()) for v in ("low", "medium", "high")]; quality.set_active_id(initial.get("quality") or "medium"); quality_label = Gtk.Label(label=_t("label.quality", settings), xalign=1.0); grid.attach(quality_label, 0, row, 1, 1); grid.attach(quality, 1, row, 1, 1); row += 1
    destination = Gtk.ComboBoxText(); destination.append("image", _t("dest.image", settings))
    if image is not None: destination.append("layer", _t("dest.layer", settings))
    destination.set_active_id(forced_destination or initial.get("destination") or (settings.default_destination if image is not None else "image")); destination.set_sensitive(not bool(forced_destination)); dest_label = Gtk.Label(label=_t("label.destination", settings), xalign=1.0); grid.attach(dest_label, 0, row, 1, 1); grid.attach(destination, 1, row, 1, 1); row += 1
    padding = None
    if task in {"context", "separate"}:
        padding = Gtk.SpinButton.new_with_range(0, 200, 5); padding.set_value(initial.get("padding", settings.context_padding_percent)); attach(_t("label.context", settings) + " (%)", padding)

    restore_inline = Gtk.Button(label=_t("advisor.restore_original", settings)); restore_inline.set_no_show_all(True)
    if ranked_action_adv:
        advisor_controls = Gtk.Box(spacing=8); advisor_controls.pack_start(restore_inline, False, False, 0)
        grid.attach(advisor_controls, 1, row, 1, 1); row += 1
    description = Gtk.Label(xalign=0.0, wrap=True); description.set_max_width_chars(105); grid.attach(description, 0, row, 2, 1); row += 1
    fallback_label = Gtk.Label(xalign=0.0, wrap=True); grid.attach(fallback_label, 0, row, 2, 1); row += 1
    cost_label = Gtk.Label(xalign=0.0, wrap=True, use_markup=True); grid.attach(cost_label, 0, row, 2, 1); row += 1
    root.pack_start(grid, False, False, 0)

    by_name = {m.name: m for m in ranked}
    suggestion = {"value": None, "applied": False}; original = {"value": None}; reviewed = {"done": False}
    def effective_model(): return ranked[0] if model_picker.get() == "auto" else by_name.get(model_picker.get(), ranked[0])
    current_estimate = {"value": None, "text": ""}
    def request_shape(operation_override=None):
        op = operation_override or (operation_combo.get_active_id() if operation_combo else None)
        has_image = task in {"edit", "separate"} or (task == "context" and op in {"replace", "remove"})
        if task == "generation" and width and height:
            w, h = int(width.get_value()), int(height.get_value())
        elif task == "context" and op == "add":
            bbox = _selection_bbox(image) if image is not None else None
            if bbox: w, h = int(bbox[2]), int(bbox[3])
            elif image is not None: w = h = max(256, min(int(image.get_width()), int(image.get_height()), 1024))
            else: w = h = 1024
        elif image is not None:
            w, h = int(image.get_width()), int(image.get_height())
        else:
            w = h = 1024
        return has_image, w, h, resolution.get_active_id(), quality.get_active_id()
    def estimate_for(m, operation_override=None):
        has_image, w, h, res, qual = request_shape(operation_override)
        text, value = _request_cost(m, settings, has_image=has_image, width=w, height=h, resolution=res, quality=qual)
        if task == "separate" or (task == "context" and (operation_override or (operation_combo.get_active_id() if operation_combo else None)) == "add"):
            text += " · " + _t("cost.plus_free_rmbg", settings)
        return text, value
    def update_cost(*_):
        m = effective_model(); text, value = estimate_for(m); current_estimate["value"] = value; current_estimate["text"] = text
        cost_label.set_markup(f"<b>{GLib.markup_escape_text(_t('cost.before_run', settings))}</b>  {GLib.markup_escape_text(text)}")
    def update_model(*_):
        m = effective_model(); previous_res = resolution.get_active_id(); resolution.remove_all()
        if m.resolutions:
            [resolution.append(v, v.upper()) for v in m.resolutions]
            resolution.set_active_id(previous_res if previous_res in m.resolutions else m.resolutions[0]); resolution_label.show(); resolution.show()
        else: resolution_label.hide(); resolution.hide()
        seed_label.set_visible(m.supports_seed); seed.set_visible(m.supports_seed)
        quality_label.set_visible(m.supports_quality); quality.set_visible(m.supports_quality); dest_label.set_visible(task == "generation"); destination.set_visible(task == "generation")
        lead = (_t("context.help", settings) + "\n" if task == "context" else _t("separate.help", settings) + "\n" if task == "separate" else "")
        description.set_text(lead + (_model_description(m, settings, health.get(m.name)) if settings.show_model_descriptions else ""))
        fb = core.pick_image_fallback(ranked, rank_task, fallback_cfg, m, settings, health)
        fallback_label.set_text((_t("label.fallback", settings) + ": " + _model_compact(fb, settings, health.get(fb.name))) if settings.fallback_enabled and fb else "")
        update_cost()
    model_picker.changed = update_model
    if operation_combo: operation_combo.connect("changed", update_cost)
    if mode_combo: mode_combo.connect("changed", update_cost)
    quality.connect("changed", update_cost); resolution.connect("changed", update_cost)
    if width: width.connect("value-changed", update_cost)
    if height: height.connect("value-changed", update_cost)

    def capture_original():
        if original["value"] is None:
            original["value"] = {
                "prompt": prompt_get(), "model": model_picker.get(),
                "mode": mode_combo.get_active_id() if mode_combo else None,
                "operation": operation_combo.get_active_id() if operation_combo else None,
            }
    def advisor_proposal(review) -> str:
        suggestion["value"] = review; capture_original()
        suggested_model = by_name.get(review.get("image_model")); suggested_cost = estimate_for(suggested_model, review.get("operation"))[0] if suggested_model else _t("cost.unknown", settings)
        proposal = GimpUi.Dialog(title=_t("advisor.proposal_title", settings), role="pollinations-advisor-proposal"); _surface_dialog(proposal)
        try: proposal.set_transient_for(dialog)
        except Exception: pass
        proposal.add_button(_t("advisor.keep_original", settings), Gtk.ResponseType.CANCEL)
        proposal.add_button(_t("advisor.accept_prompt", settings), RESPONSE_ADVISOR_PROMPT)
        proposal.add_button(_t("advisor.accept_model", settings), RESPONSE_ADVISOR_MODEL)
        proposal.add_button(_t("advisor.accept_both", settings), RESPONSE_ADVISOR_BOTH)
        proposal.set_default_response(RESPONSE_ADVISOR_BOTH)
        proposal.set_default_size(920, 650)
        box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=12, margin=16)
        heading = Gtk.Label(xalign=0.0, use_markup=True)
        heading.set_markup(f"<span size='x-large' weight='bold'>{GLib.markup_escape_text(_t('advisor.proposal_title', settings))}</span>")
        box.pack_start(heading, False, False, 0)

        # The suggested model is deliberately the visual focal point.
        if suggested_model:
            model_frame = Gtk.Frame()
            model_box = Gtk.Box(orientation=Gtk.Orientation.VERTICAL, spacing=5, margin=14)
            model_name = Gtk.Label(xalign=0.0, use_markup=True)
            model_name.set_markup(f"<span size='xx-large' weight='bold'>{GLib.markup_escape_text(suggested_model.title or suggested_model.name)}</span>")
            model_box.pack_start(model_name, False, False, 0)
            badge_color = "#d79a2b" if suggested_model.paid_only else "#4fa866"
            badge_symbol = "◆" if suggested_model.paid_only else "✦"
            badge_text = _t("model.paid", settings) if suggested_model.paid_only else _t("model.quest", settings)
            origin_text = _t("model.community", settings) if suggested_model.community else _t("model.official", settings)
            badge = Gtk.Label(xalign=0.0, use_markup=True)
            badge.set_markup(f"<span foreground='{badge_color}' weight='bold'>{badge_symbol} {GLib.markup_escape_text(badge_text)}</span>   ·   {GLib.markup_escape_text(origin_text)}")
            model_box.pack_start(badge, False, False, 0)
            price = Gtk.Label(xalign=0.0, use_markup=True)
            price.set_markup(f"<b>{GLib.markup_escape_text(_t('cost.before_run', settings))}</b>  {GLib.markup_escape_text(suggested_cost)}")
            model_box.pack_start(price, False, False, 0)
            model_frame.add(model_box); box.pack_start(model_frame, False, False, 0)

        meta = []
        if review.get("operation"): meta.append(f"<b>{GLib.markup_escape_text(_t('advisor.suggested_operation', settings))}</b> {GLib.markup_escape_text(str(review['operation']))}")
        if review.get("reason"): meta.append(f"<b>{GLib.markup_escape_text(_t('advisor.reason', settings))}</b> {GLib.markup_escape_text(review['reason'])}")
        if review.get("warning"): meta.append(f"<b>{GLib.markup_escape_text(_t('advisor.warning', settings))}</b> {GLib.markup_escape_text(review['warning'])}")
        if meta:
            summary = Gtk.Label(xalign=0.0, wrap=True, use_markup=True); summary.set_max_width_chars(110); summary.set_markup("\n".join(meta)); box.pack_start(summary, False, False, 0)
        prompt_title = Gtk.Label(xalign=0.0, use_markup=True); prompt_title.set_markup(f"<b>{GLib.markup_escape_text(_t('advisor.prompt_suggestion', settings))}</b>"); box.pack_start(prompt_title, False, False, 0)
        sw = Gtk.ScrolledWindow(); sw.set_policy(Gtk.PolicyType.AUTOMATIC, Gtk.PolicyType.AUTOMATIC); sw.set_min_content_height(200)
        view = Gtk.TextView(); view.set_wrap_mode(Gtk.WrapMode.WORD_CHAR); view.set_editable(False); view.set_cursor_visible(False); view.set_left_margin(8); view.set_right_margin(8); view.set_top_margin(6); view.set_bottom_margin(6); view.get_buffer().set_text(review.get("prompt") or prompt_get()); sw.add(view); box.pack_start(sw, True, True, 0)
        note = Gtk.Label(label=_t("advisor.explicit_note", settings), xalign=0.0, wrap=True); note.get_style_context().add_class("dim-label"); box.pack_start(note, False, False, 0)
        proposal.get_content_area().pack_start(box, True, True, 0); _present_dialog(proposal); response = proposal.run(); proposal.destroy()
        return {RESPONSE_ADVISOR_PROMPT:"prompt", RESPONSE_ADVISOR_MODEL:"model", RESPONSE_ADVISOR_BOTH:"both"}.get(response, "none")

    def apply_advice(mode: str):
        review = suggestion["value"]
        if not review or mode == "none": return
        if mode in {"prompt", "both"}:
            prompt_set(review.get("prompt") or prompt_get())
        if mode in {"model", "both"} and review.get("image_model") in by_name:
            model_picker.set(review["image_model"])
        # Operation remains advisory: never silently change the user's tool mode.
        suggestion["applied"] = True
        suggestion["applied_mode"] = mode
        restore_inline.set_no_show_all(False); restore_inline.show()
        update_model()
    def restore_flow(_button):
        state = original["value"]
        if not state: return
        prompt_set(state["prompt"]); model_picker.set(state["model"])
        if mode_combo and state["mode"]: mode_combo.set_active_id(state["mode"])
        if operation_combo and state["operation"]: operation_combo.set_active_id(state["operation"])
        suggestion["applied"] = False; suggestion["applied_mode"] = "none"
        restore_inline.hide(); update_model()
    restore_inline.connect("clicked", restore_flow)

    def execution_prompt():
        text = prompt_get()
        if text: return text
        selected = _selection_bbox(image) is not None if image is not None else False
        if task == "separate": return "the selected foreground subject" if selected else "the main foreground subject"
        if task == "context" and operation_combo and operation_combo.get_active_id() == "remove" and selected: return "the selected subject"
        return ""

    dialog.get_content_area().pack_start(root, True, True, 0); _present_dialog(dialog); update_model()
    if initial.get("resolution"):
        resolution.set_active_id(initial["resolution"])
    update_cost(); prompt_view.grab_focus()
    while True:
        response = dialog.run()
        if response == RESPONSE_REVIEW:
            text = execution_prompt()
            if not text: _message(_t("error.empty_prompt", settings), error=True); continue
            advisor_task = mode_combo.get_active_id() if task == "edit" else operation_combo.get_active_id() if task == "context" else task
            try:
                review = _advisor_review(token, settings, advisor_models, ranked, health, prompt=text, task=advisor_task, image=image, operation=operation_combo.get_active_id() if operation_combo else None, advisor_override=advisor_picker.get())
                reviewed["done"] = True
                apply_advice(advisor_proposal(review))
                continue
            except Exception as exc:
                _message(_t("advisor.failed", settings, error=str(exc)), error=True); reviewed["done"] = True; continue
        if response != Gtk.ResponseType.OK:
            dialog.destroy(); return None
        break

    text = execution_prompt()
    if not text:
        dialog.destroy(); raise api.PollinationsError("bad_request", _t("error.empty_prompt", settings))
    m = effective_model(); dims = (None, None)
    if task == "generation": dims = core.validate_dimensions(int(width.get_value()), int(height.get_value()))
    result = {
        "prompt": text, "model": m, "advisor_id": advisor_picker.get() if ranked_action_adv else "auto", "auto_selected": model_picker.get() == "auto",
        "width": dims[0], "height": dims[1], "size": None, "resolution": resolution.get_active_id() if m.resolutions else None,
        "seed": None if (not m.supports_seed or int(seed.get_value()) < 0) else int(seed.get_value()), "quality": quality.get_active_id() if m.supports_quality else None,
        "transparent": False, "destination": destination.get_active_id() if task == "generation" else "layer",
        "mode": mode_combo.get_active_id() if mode_combo else None, "operation": operation_combo.get_active_id() if operation_combo else None,
        "padding": int(padding.get_value()) if padding else settings.context_padding_percent,
        "advisor_reviewed": reviewed["done"], "advisor_applied": suggestion["applied"], "advisor_applied_mode": suggestion.get("applied_mode", "none"),
        "advisor_suggested_model": (suggestion["value"] or {}).get("image_model"),
        "estimated_cost_pollen": current_estimate["value"], "estimated_cost_text": current_estimate["text"],
    }
    dialog.destroy(); return result


def _context_instruction(operation: str, user_prompt: str, target_bbox, context_bbox) -> str:
    tx,ty,tw,th=target_bbox; cx,cy,cw,ch=context_bbox; rx,ry=tx-cx,ty-cy; target=f"target rectangle x={rx}, y={ry}, width={tw}, height={th} inside this {cw}x{ch} contextual crop"
    if operation=="add": return f"Add {user_prompt} inside the {target}. Keep the surrounding scene unchanged and make lighting, scale and perspective coherent."
    if operation=="replace": return f"Replace the object/content inside the {target} with {user_prompt}. Keep the surrounding scene unchanged and preserve realistic scale, lighting and perspective."
    if operation=="remove": return f"Remove {user_prompt} from the {target} and reconstruct the background naturally. Keep everything outside the target rectangle unchanged."
    return f"Apply this edit only inside the {target}: {user_prompt}. Keep the surrounding context unchanged."


def _run_generate_common(procedure, image, *, forced_destination: str | None = None):
    if not _ensure_onboarding(): return _cancel(procedure)
    settings = _settings(); token = _require_token(settings)
    image_models, advisor_models, health = _load_catalogs_visible(token, settings)
    previous = None
    while True:
        choice = _action_dialog(
            token, image_models, advisor_models, health,
            image=image, task="generation", forced_destination=forced_destination,
            initial=previous,
        )
        if choice is None: return _cancel(procedure)
        previous = choice
        try:
            fallback = core.pick_image_fallback(image_models, "generation", settings.generation_fallback_model, choice["model"], settings, health)
            def call(model, stage):
                stage(_t("progress.sending", settings, model=model.name)); stage(_t("progress.waiting", settings, model=model.name))
                result = api.generate_image(token, model, choice["prompt"], width=choice["width"], height=choice["height"], resolution=choice["resolution"], seed=choice["seed"], quality=choice["quality"], transparent=choice["transparent"])
                stage(_t("progress.received", settings)); return result
            result, used = _run_model_request(choice["model"], fallback, settings, _t("progress.generate", settings, model=choice["model"].name), call, auto_selected=choice["auto_selected"])
            _import_result(result, image, destination=choice["destination"], name=f"Pollinations · Generate · {used.name}")
            _append_activity("generate", choice, used, health=health, extra={"width": choice["width"], "height": choice["height"], "quality": choice["quality"]})
            return _success(procedure)
        except api.PollinationsError as exc:
            if exc.kind == "auth":
                _store().clear(); raise
            # Keep the entire form state after moderation, provider, payment,
            # network or API errors. The user can edit and retry immediately.
            _show_error(exc)
            continue


def _run_generate(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_GENERATE)
    try: return _run_generate_common(procedure,image)
    except api.PollinationsError as exc:
        if exc.kind=="auth": _store().clear()
        return _execution_error(procedure,exc)
    except Exception as exc: return _execution_error(procedure,exc)


def _run_generate_layer(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_GENERATE_LAYER)
    try:
        if image is None: raise api.PollinationsError("bad_request",_t("error.no_image"))
        return _run_generate_common(procedure,image,forced_destination="layer")
    except api.PollinationsError as exc:
        if exc.kind=="auth": _store().clear()
        return _execution_error(procedure,exc)
    except Exception as exc: return _execution_error(procedure,exc)


def _run_edit(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_EDIT)
    try:
        if image is None: raise api.PollinationsError("bad_request", _t("error.no_image"))
        if not _ensure_onboarding(): return _cancel(procedure)
        settings = _settings(); token = _require_token(settings)
        models, advisors, health = _load_catalogs_visible(token, settings)
        previous = None
        while True:
            choice = _action_dialog(token, models, advisors, health, image=image, task="edit", initial=previous)
            if choice is None: return _cancel(procedure)
            previous = choice
            try:
                drawable = _selected_drawable(image, drawables)
                if choice["mode"] == "selection_patch":
                    if _selection_bbox(image) is None:
                        raise api.PollinationsError("bad_request", _t("error.selection_required", settings))
                    source, bbox = _export_selected_pixels(image, drawables)
                else:
                    source = _export_full_drawable_png(drawable); bbox = _drawable_bbox(drawable)
                fallback = core.pick_image_fallback(models, "edit", settings.edit_fallback_model, choice["model"], settings, health)
                def call(model, stage):
                    stage(_t("progress.sending", settings, model=model.name)); stage(_t("progress.waiting", settings, model=model.name))
                    result = api.edit_image(token, model, choice["prompt"], source, size=choice["size"], resolution=choice["resolution"], seed=choice["seed"], quality=choice["quality"])
                    stage(_t("progress.received", settings)); return result
                result, used = _run_model_request(choice["model"], fallback, settings, _t("progress.edit", settings, model=choice["model"].name), call, auto_selected=choice["auto_selected"])
                image.undo_group_start()
                try: layer = _import_layer_bytes(image, result.data, name=f"Pollinations edit — {used.name}", bbox=bbox, position=0)
                finally: image.undo_group_end()
                image.set_selected_layers([layer]); Gimp.displays_flush()
                _append_activity("edit", choice, used, health=health, extra={"mode": choice["mode"], "bbox": list(bbox) if bbox else None})
                return _success(procedure)
            except api.PollinationsError as exc:
                if exc.kind == "auth":
                    _store().clear(); raise
                _show_error(exc)
                continue
    except api.PollinationsError as exc:
        if exc.kind == "auth": _store().clear()
        return _execution_error(procedure, exc)
    except Exception as exc:
        return _execution_error(procedure, exc)


def _full_layer_instruction(operation: str, user_prompt: str, target_bbox, drawable_bbox) -> str:
    dx, dy, dw, dh = drawable_bbox
    target_text = ""
    if target_bbox:
        tx, ty, tw, th = target_bbox
        target_text = f" Target rectangle inside this full {dw}x{dh} layer: x={tx-dx}, y={ty-dy}, width={tw}, height={th}."
    if operation == "remove":
        subject = user_prompt or "the subject inside the target rectangle"
        return (f"REMOVE OBJECT. Remove {subject} and reconstruct the naturally occluded background."
                f"{target_text} Return the FULL image at exactly the same dimensions. Preserve every pixel outside the removal region as closely as possible; do not crop, shift, rescale, recolor or redesign the scene.")
    if operation == "replace":
        return (f"REPLACE OBJECT. Replace the requested content with: {user_prompt}.{target_text} "
                "Return the FULL image at exactly the same dimensions. Preserve every pixel outside the target region; keep perspective, scale, lighting and shadows coherent.")
    return user_prompt


def _run_context(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_CONTEXT)
    try:
        if image is None: raise api.PollinationsError("bad_request", _t("error.no_image"))
        if not _ensure_onboarding(): return _cancel(procedure)
        settings = _settings(); token = _require_token(settings)
        models, advisors, health = _load_catalogs_visible(token, settings)
        previous = None
        while True:
            choice = _action_dialog(token, models, advisors, health, image=image, task="context", initial=previous)
            if choice is None: return _cancel(procedure)
            previous = choice
            try:
                drawable = _selected_drawable(image, drawables)
                target = _selection_bbox(image); operation = choice["operation"]
                full_bbox = _drawable_bbox(drawable)
                fallback = core.pick_image_fallback(models, "context", settings.edit_fallback_model, choice["model"], settings, health)

                if operation == "add":
                    if not choice["prompt"]:
                        raise api.PollinationsError("bad_request", _t("error.empty_prompt", settings))
                    if target:
                        _, _, tw, th = target; gen_w, gen_h = core.validate_dimensions(max(256, tw), max(256, th)); place_bbox = target
                    else:
                        side = max(256, min(int(image.get_width()), int(image.get_height()), 1024)); gen_w = gen_h = side
                        place_bbox = ((int(image.get_width()) - side)//2, (int(image.get_height()) - side)//2, side, side)
                    asset_prompt = (f"Create ONLY this object as a clean standalone asset: {choice['prompt']}. "
                                    "Center the complete object on a simple uniform neutral background with clear separation. No surrounding scene, no text, no frame, no cropped parts. Preserve realistic proportions and useful clean edges for background removal.")
                    def gen_call(model, stage):
                        stage(_t("progress.sending", settings, model=model.name)); stage(_t("progress.waiting", settings, model=model.name))
                        return api.generate_image(token, model, asset_prompt, width=gen_w, height=gen_h, resolution=choice["resolution"], seed=choice["seed"], quality=choice["quality"])
                    generated, used = _run_model_request(choice["model"], fallback, settings, _t("progress.generate", settings, model=choice["model"].name), gen_call, auto_selected=choice["auto_selected"])
                    cut = _progress_job(_t("menu.isolate", settings), settings, lambda stage: _run_rmbg(generated.data, settings, stage))
                    image.undo_group_start()
                    try: layer = _import_layer_bytes(image, cut.data, name=f"Pollinations · Add · {used.name}", bbox=place_bbox, position=0)
                    finally: image.undo_group_end()
                    image.set_selected_layers([layer]); Gimp.displays_flush()
                    _append_activity("add", choice, used, health=health, provider="clearbackdrop", extra={"bbox": list(place_bbox)})
                    return _success(procedure)

                source = _export_full_drawable_png(drawable)
                prompt = _full_layer_instruction(operation, choice["prompt"], target, full_bbox)
                def edit_call(model, stage):
                    stage(_t("progress.sending", settings, model=model.name)); stage(_t("progress.waiting", settings, model=model.name))
                    return api.edit_image(token, model, prompt, source, resolution=choice["resolution"], seed=choice["seed"], quality=choice["quality"])
                result, used = _run_model_request(choice["model"], fallback, settings, _t("progress.edit", settings, model=choice["model"].name), edit_call, auto_selected=choice["auto_selected"])
                image.undo_group_start()
                try: layer = _import_layer_bytes(image, result.data, name=f"Pollinations · {operation.title()} · {used.name}", bbox=full_bbox, position=0)
                finally: image.undo_group_end()
                image.set_selected_layers([layer]); Gimp.displays_flush()
                _append_activity(operation, choice, used, health=health, extra={"bbox": list(target) if target else None, "full_layer": True})
                return _success(procedure)
            except api.PollinationsError as exc:
                if exc.kind == "auth":
                    _store().clear(); raise
                _show_error(exc)
                continue
    except api.PollinationsError as exc:
        if exc.kind == "auth": _store().clear()
        return _execution_error(procedure, exc)
    except Exception as exc:
        return _execution_error(procedure, exc)


def _run_rmbg(source: bytes, settings: core.Settings, stage) -> api.RmbgResult:
    """PR scope: one predictable zero-config RMBG provider."""
    if settings.rmbg_provider == "off":
        raise api.PollinationsError("rmbg", _t("rmbg.disabled", settings))
    stage(_t("progress.rmbg_clearbackdrop", settings))
    return api.remove_background_clearbackdrop(source)


def _run_isolate(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_ISOLATE)
    try:
        if image is None:
            raise api.PollinationsError("bad_request", _t("error.no_image"))
        if not _ensure_onboarding():
            return _cancel(procedure)
        settings = _settings()
        source, bbox = _export_selected_pixels(image, drawables)
        result = _progress_job(_t("menu.isolate", settings), settings, lambda stage: _run_rmbg(source, settings, stage))
        image.undo_group_start()
        try:
            layer = _import_layer_bytes(image, result.data, name=f"Pollinations · Isolate · {result.provider or 'ClearBackdrop'}", bbox=bbox, position=0)
        finally:
            image.undo_group_end()
        image.set_selected_layers([layer]); Gimp.displays_flush()
        _append_activity("isolate", None, None, provider="clearbackdrop", extra={"bbox":list(bbox)})
        return _success(procedure)
    except Exception as exc:
        return _execution_error(procedure, exc)


def _run_separate(procedure, run_mode, image, drawables, config, data):
    GimpUi.init(PROC_SEPARATE)
    try:
        if image is None: raise api.PollinationsError("bad_request", _t("error.no_image"))
        if not _ensure_onboarding(): return _cancel(procedure)
        settings = _settings(); token = _require_token(settings)
        models, advisors, health = _load_catalogs_visible(token, settings)
        previous = None
        while True:
            choice = _action_dialog(token, models, advisors, health, image=image, task="separate", initial=previous)
            if choice is None: return _cancel(procedure)
            previous = choice
            try:
                drawable = _selected_drawable(image, drawables); full_bbox = _drawable_bbox(drawable)
                original = _export_full_drawable_png(drawable)
                source, object_bbox = _export_selected_pixels(image, drawables)
                cut = _progress_job(_t("menu.isolate", settings), settings, lambda stage: _run_rmbg(source, settings, stage))
                hole = _export_drawable_with_hole(drawable, cut.data, object_bbox, grow_px=4)
                bg_prompt = ("BACKGROUND RECONSTRUCTION. A foreground object has already been removed and its region is transparent. "
                             "Fill ONLY the transparent/missing region with the most plausible continuation of the original background. "
                             "Return the FULL image at exactly the same dimensions. Preserve all existing non-transparent pixels, framing, perspective, colors and geometry; do not recreate the removed object and do not crop or shift the image.")
                fallback = core.pick_image_fallback(models, "separate", settings.edit_fallback_model, choice["model"], settings, health)
                def bg_call(model, stage):
                    stage(_t("progress.background", settings)); stage(_t("progress.waiting", settings, model=model.name))
                    return api.edit_image(token, model, bg_prompt, hole, resolution=choice["resolution"], seed=choice["seed"], quality=choice["quality"])
                background, used = _run_model_request(choice["model"], fallback, settings, _t("progress.separate", settings, model=choice["model"].name), bg_call, auto_selected=choice["auto_selected"])
                image.undo_group_start()
                try:
                    parent = None
                    if settings.group_separation_outputs:
                        parent = Gimp.GroupLayer.new(image, _t("separate.group", settings)); image.insert_layer(parent, None, 0)
                    if settings.preserve_original:
                        _import_layer_bytes(image, original, name=_t("separate.original", settings), bbox=full_bbox, parent=parent, position=0)
                    _import_layer_bytes(image, background.data, name=f"{_t('separate.background', settings)} · {used.name}", bbox=full_bbox, parent=parent, position=0)
                    object_layer = _import_layer_bytes(image, cut.data, name=f"{_t('separate.object', settings)} · ClearBackdrop", bbox=object_bbox, parent=parent, position=0)
                finally:
                    image.undo_group_end()
                image.set_selected_layers([object_layer]); Gimp.displays_flush()
                _append_activity("magic-separate", choice, used, health=health, provider="clearbackdrop", extra={"object_bbox": list(object_bbox), "full_layer": True})
                return _success(procedure)
            except api.PollinationsError as exc:
                if exc.kind == "auth":
                    _store().clear(); raise
                _show_error(exc)
                continue
    except api.PollinationsError as exc:
        if exc.kind == "auth": _store().clear()
        return _execution_error(procedure, exc)
    except Exception as exc:
        return _execution_error(procedure, exc)

class PollinationsGimp(Gimp.PlugIn):
    def do_set_i18n(self, procname): return False, None, None
    def do_query_procedures(self): return [PROC_CONNECT,PROC_GENERATE,PROC_GENERATE_LAYER,PROC_EDIT,PROC_CONTEXT,PROC_SEPARATE,PROC_ISOLATE,PROC_SETTINGS,PROC_ACTIVITY,PROC_ABOUT,PROC_DISCONNECT]
    def do_create_procedure(self,name):
        settings=_settings(); callbacks={
            PROC_CONNECT:(_run_connect,"menu.connect","Authorize GIMP with Pollinations BYOP"), PROC_GENERATE:(_run_generate,"menu.generate","Generate a Pollinations image"), PROC_GENERATE_LAYER:(_run_generate_layer,"menu.generate_layer","Generate into a new GIMP layer"),
            PROC_EDIT:(_run_edit,"menu.edit","Edit the active layer or selection non-destructively"), PROC_CONTEXT:(_run_context,"menu.context","Add, replace or remove an object with scene context"), PROC_SEPARATE:(_run_separate,"menu.separate","Semantically isolate an object and reconstruct the background"),
            PROC_ISOLATE:(_run_isolate,"menu.isolate","Isolate a selected subject into a transparent layer with RMBG"), PROC_SETTINGS:(_run_settings,"menu.settings","Configure models, health/fallback, advisor, language and RMBG"), PROC_ACTIVITY:(_run_activity,"menu.activity","Show Pollinations account identity, key budget, balance and usage"), PROC_ABOUT:(_run_about,"menu.about","About Pollinations AI for GIMP"), PROC_DISCONNECT:(_run_disconnect,"menu.disconnect","Remove local Pollinations authorization")}
        if name not in callbacks: return None
        callback,label_key,documentation=callbacks[name]; procedure=Gimp.ImageProcedure.new(self,name,Gimp.PDBProcType.PLUGIN,callback,None); procedure.set_image_types("*"); procedure.set_menu_label(_t(label_key,settings))
        paths={
            PROC_CONNECT:[], PROC_GENERATE:["<Image>/File/Create","<Image>/Pollinations AI"], PROC_GENERATE_LAYER:["<Image>/Layer/Pollinations AI","<Image>/Pollinations AI"],
            PROC_EDIT:["<Image>/Layer/Pollinations AI","<Image>/Select/Pollinations AI","<Image>/Pollinations AI"], PROC_CONTEXT:["<Image>/Layer/Pollinations AI","<Image>/Select/Pollinations AI","<Image>/Pollinations AI"],
            PROC_SEPARATE:["<Image>/Layer/Pollinations AI","<Image>/Select/Pollinations AI","<Image>/Pollinations AI"], PROC_ISOLATE:["<Image>/Layer/Pollinations AI","<Image>/Select/Pollinations AI","<Image>/Pollinations AI"],
            PROC_SETTINGS:["<Image>/Edit","<Image>/Pollinations AI"], PROC_ACTIVITY:["<Image>/Pollinations AI"], PROC_ABOUT:["<Image>/Pollinations AI"], PROC_DISCONNECT:[]}
        for path in paths[name]: procedure.add_menu_path(path)
        procedure.set_documentation(documentation,documentation,name); procedure.set_attribution("fkom13","fkom13","2026")
        if name in {PROC_GENERATE_LAYER,PROC_EDIT,PROC_CONTEXT,PROC_SEPARATE,PROC_ISOLATE}: procedure.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.DRAWABLE|Gimp.ProcedureSensitivityMask.DRAWABLES)
        else: procedure.set_sensitivity_mask(Gimp.ProcedureSensitivityMask.DRAWABLE|Gimp.ProcedureSensitivityMask.DRAWABLES|Gimp.ProcedureSensitivityMask.NO_DRAWABLES|Gimp.ProcedureSensitivityMask.NO_IMAGE)
        return procedure


Gimp.main(PollinationsGimp.__gtype__, sys.argv)
