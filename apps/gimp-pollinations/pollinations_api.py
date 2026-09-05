#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
pollinations_api.py — Pollinations API layer for the GIMP 3 plug-in.

Pure Python standard library. No GIMP, no GTK, no pip dependencies, so it can
be imported by GIMP 3's bundled interpreter and exercised by plain unit tests
(`python -m unittest test_pollinations_api -v`).

Covers:
  * BYOP device authorization (RFC 8628) against https://enter.pollinations.ai
  * Live image model catalog:  GET  /image/models
  * Image generation:           POST /v1/images/generations
  * Image editing (upload):     POST /v1/images/edits

Each user connects with their own Pollinations account (BYOP): the plug-in
never asks for an API key. It runs the device-authorization flow and stores
the resulting user key privately (0600) in the platform config directory,
where it survives GIMP restarts until disconnected or revoked.
"""

import base64
import collections
import io
import json
import os
import platform
import socket
import tempfile
import time
import urllib.error
import urllib.request
import uuid

AUTH_BASE_URL = "https://enter.pollinations.ai"
API_BASE_URL = "https://gen.pollinations.ai"

# The publishable App Key (pk_...) identifying this integration on the
# Pollinations consent screen ("GIMP plug-in"). Without a valid App Key the
# consent screen falls back to a generic hostname and traffic is not
# attributed. Maintainers can replace this with the official key; users can
# override it with the POLLINATIONS_APP_KEY environment variable.
DEFAULT_APP_KEY = "pk_gimp_pollinations"

DEVICE_CODE_PATH = "/api/device/code"
DEVICE_TOKEN_PATH = "/api/device/token"
USERINFO_PATH = "/api/device/userinfo"
MODELS_PATH = "/image/models"
GENERATE_PATH = "/v1/images/generations"
EDIT_PATH = "/v1/images/edits"

DEFAULT_POLL_INTERVAL = 5
DEFAULT_TIMEOUT = 30  # seconds, for auth + catalog calls
IMAGE_TIMEOUT = 300   # seconds, generation/editing can take a while

RECONNECT_HINT = (
    "Your Pollinations authorization is missing, expired or was revoked. "
    "Choose Filters > Pollinations AI > Connect Account to reconnect."
)
POLLEN_HINT = (
    "This request costs more Pollen than your account budget allows. "
    "Top up or raise the budget at https://enter.pollinations.ai and try again."
)
NETWORK_HINT = (
    "Could not reach Pollinations (%s). Check your internet connection or "
    "proxy settings, then try again."
)


# ---------------------------------------------------------------------------
# Errors — every error carries a user-facing recovery message
# ---------------------------------------------------------------------------

class PollinationsError(Exception):
    """Base class for all errors raised by this module."""

    def __init__(self, message):
        super().__init__(message)
        self.user_message = message


class NetworkError(PollinationsError):
    """Connection failed / timed out."""


class AuthError(PollinationsError):
    """401/403 — the stored key is gone, expired or revoked: reconnect."""


class InsufficientPollenError(PollinationsError):
    """402 — not enough Pollen to pay for the request."""


class ApiError(PollinationsError):
    """Any other API failure; carries the HTTP status."""

    def __init__(self, status, message):
        super().__init__("[%s] %s" % (status, message))
        self.status = status


class DeviceAuthError(PollinationsError):
    """Device-authorization flow failed."""


class AccessDeniedError(DeviceAuthError):
    """The user denied the authorization request in the browser."""


class DeviceAuthExpiredError(DeviceAuthError):
    """The device code expired before approval completed."""


# ---------------------------------------------------------------------------
# HTTP plumbing (urllib only)
# ---------------------------------------------------------------------------

def http_request(method, url, body=None, headers=None, timeout=DEFAULT_TIMEOUT,
                 opener=None):
    """Perform an HTTP request. Returns (status, parsed_json_or_None).

    Raises NetworkError for connection problems so callers can show a clear
    recovery message instead of a urllib traceback.
    """
    request = urllib.request.Request(url, data=body, method=method)
    for key, value in (headers or {}).items():
        request.add_header(key, value)
    try:
        if opener is not None:
            response = opener.open(request, timeout=timeout)
        else:
            response = urllib.request.urlopen(request, timeout=timeout)
        status = response.getcode()
        raw = response.read()
    except urllib.error.HTTPError as error:
        status = error.code
        try:
            raw = error.read()
        except Exception:  # pragma: no cover - defensive
            raw = b""
    except (urllib.error.URLError, socket.timeout, OSError) as error:
        raise NetworkError(NETWORK_HINT % error)
    return status, _parse_json(raw)


def http_download(url, timeout=IMAGE_TIMEOUT, opener=None):
    """GET a URL and return the raw bytes. Raises NetworkError/ApiError."""
    request = urllib.request.Request(url, method="GET")
    try:
        if opener is not None:
            response = opener.open(request, timeout=timeout)
        else:
            response = urllib.request.urlopen(request, timeout=timeout)
        return response.read()
    except urllib.error.HTTPError as error:
        raise ApiError(error.code, "Download failed (HTTP %s)." % error.code)
    except (urllib.error.URLError, socket.timeout, OSError) as error:
        raise NetworkError(NETWORK_HINT % error)


def _parse_json(raw):
    if not raw:
        return None
    try:
        return json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        return None


def _extract_error_message(body):
    """Pull a human-readable message out of the various error body shapes."""
    if not isinstance(body, dict):
        return None
    error = body.get("error")
    if isinstance(error, dict):
        return error.get("message") or error.get("code")
    if isinstance(error, str):
        return error
    return body.get("error_description") or body.get("message")


def _raise_for_status(status, body):
    """Map an HTTP status to an actionable exception."""
    if 200 <= status < 300:
        return
    message = _extract_error_message(body) or \
        "Pollinations request failed (HTTP %s)." % status
    if status in (401, 403):
        raise AuthError(RECONNECT_HINT)
    if status == 402:
        raise InsufficientPollenError(POLLEN_HINT)
    raise ApiError(status, message)


def encode_multipart(fields, file_field, file_name, file_bytes, file_mime):
    """Build a multipart/form-data body with one file part.

    Returns (body_bytes, content_type_header).
    """
    boundary = "pollinations-gimp-" + uuid.uuid4().hex
    buffer = io.BytesIO()

    def write(text):
        buffer.write(text.encode("utf-8"))

    for name, value in fields.items():
        write("--%s\r\n" % boundary)
        write('Content-Disposition: form-data; name="%s"\r\n\r\n' % name)
        write("%s\r\n" % value)

    write("--%s\r\n" % boundary)
    write('Content-Disposition: form-data; name="%s"; filename="%s"\r\n'
          % (file_field, file_name))
    write("Content-Type: %s\r\n\r\n" % file_mime)
    buffer.write(file_bytes)
    write("\r\n--%s--\r\n" % boundary)

    content_type = "multipart/form-data; boundary=%s" % boundary
    return buffer.getvalue(), content_type


# ---------------------------------------------------------------------------
# Token storage — atomic, private (0600), survives restarts
# ---------------------------------------------------------------------------

class TokenStore(object):
    """Stores the user-authorized key (sk_...) in the platform config dir."""

    FILE_NAME = "auth.json"

    def __init__(self, base_dir=None):
        self.base_dir = base_dir if base_dir is not None else self.default_dir()
        self.path = os.path.join(self.base_dir, self.FILE_NAME)

    @staticmethod
    def default_dir():
        system = platform.system()
        if system == "Windows":
            base = os.environ.get("APPDATA") or os.path.expanduser("~")
            return os.path.join(base, "pollinations-gimp")
        if system == "Darwin":
            return os.path.expanduser(
                "~/Library/Application Support/pollinations-gimp")
        base = os.environ.get("XDG_CONFIG_HOME") or os.path.expanduser("~/.config")
        return os.path.join(base, "pollinations-gimp")

    def save(self, token, username=None):
        """Atomically write the token file (write-to-temp then rename)."""
        os.makedirs(self.base_dir, exist_ok=True)
        payload = {"token": token}
        if username:
            payload["username"] = username
        handle, temp_path = tempfile.mkstemp(
            dir=self.base_dir, prefix=".auth-", suffix=".tmp")
        try:
            with os.fdopen(handle, "w", encoding="utf-8") as file:
                json.dump(payload, file)
            # No-op on Windows; restrictive elsewhere. The token never leaves
            # the user profile directory.
            os.chmod(temp_path, 0o600)
            os.replace(temp_path, self.path)
        except Exception:
            try:
                os.unlink(temp_path)
            except OSError:
                pass
            raise

    def load(self):
        """Return {'token': 'sk_...', 'username': ...} or None."""
        try:
            with open(self.path, "r", encoding="utf-8") as file:
                data = json.load(file)
        except (OSError, ValueError):
            return None
        if isinstance(data, dict) and data.get("token"):
            return data
        return None

    def load_token(self):
        data = self.load()
        return data["token"] if data else None

    def clear(self):
        """Delete the stored authorization (Disconnect Account)."""
        try:
            os.unlink(self.path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# BYOP device authorization (RFC 8628)
# ---------------------------------------------------------------------------

DeviceCode = collections.namedtuple(
    "DeviceCode",
    ["device_code", "user_code", "verification_uri",
     "verification_uri_complete", "expires_in", "interval"])


class DeviceAuthenticator(object):
    """Runs the Pollinations device-authorization flow.

    The user never pastes an API key into GIMP: the plug-in shows a URL and
    a short code, the user approves in the browser, and the resulting key is
    returned here for private storage.
    """

    def __init__(self, app_key=None, auth_base=None, timeout=DEFAULT_TIMEOUT,
                 opener=None):
        self.app_key = app_key if app_key is not None else default_app_key()
        self.auth_base = (auth_base or AUTH_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.opener = opener

    def request_device_code(self):
        """Ask Pollinations for a device + user code pair."""
        status, body = http_request(
            "POST",
            self.auth_base + DEVICE_CODE_PATH,
            body=json.dumps({"client_id": self.app_key}).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            timeout=self.timeout,
            opener=self.opener)
        _raise_for_status(status, body)
        if not isinstance(body, dict) or not body.get("device_code"):
            raise ApiError(status or 0,
                           "Unexpected device authorization response.")
        return DeviceCode(
            device_code=body["device_code"],
            user_code=body.get("user_code", ""),
            verification_uri=body.get("verification_uri",
                                     self.auth_base + "/device"),
            verification_uri_complete=body.get("verification_uri_complete")
            or body.get("verification_uri", self.auth_base + "/device"),
            expires_in=int(body.get("expires_in", 1800)),
            interval=int(body.get("interval", DEFAULT_POLL_INTERVAL)),
        )

    def poll_for_token(self, device_code, interval=None, expires_in=None,
                       is_cancelled=None):
        """Poll the token endpoint until approved, denied or expired.

        Returns the access token (sk_...), or None when `is_cancelled`
        became true. Raises AccessDeniedError / DeviceAuthExpiredError /
        ApiError / NetworkError otherwise.
        """
        if interval is None:
            interval = DEFAULT_POLL_INTERVAL
        if interval < 0:
            interval = 0
        deadline = time.monotonic() + (expires_in if expires_in is not None
                                       else 1800)
        while time.monotonic() < deadline:
            if is_cancelled is not None and is_cancelled():
                return None
            status, body = http_request(
                "POST",
                self.auth_base + DEVICE_TOKEN_PATH,
                body=json.dumps({"device_code": device_code}).encode("utf-8"),
                headers={"Content-Type": "application/json"},
                timeout=self.timeout,
                opener=self.opener)
            if isinstance(body, dict):
                token = body.get("access_token")
                if token:
                    return token
                error = body.get("error")
                if error == "authorization_pending":
                    pass  # keep waiting
                elif error == "slow_down":
                    interval = min(interval + 5, 30)
                elif error == "expired_token":
                    raise DeviceAuthExpiredError(
                        "The device code expired before approval finished. "
                        "Start Connect Account again.")
                elif error == "access_denied":
                    raise AccessDeniedError(
                        "The authorization request was denied. Run Connect "
                        "Account again if this was a mistake.")
                elif error:
                    raise ApiError(
                        status if status and status >= 400 else 0,
                        "Device authorization failed: %s."
                        % str(error).replace("_", " "))
                elif status >= 400:
                    raise ApiError(status, _extract_error_message(body)
                                   or "Device authorization failed.")
            elif status >= 400:
                raise ApiError(status, "Device authorization failed.")
            time.sleep(interval)
        raise DeviceAuthExpiredError(
            "The device code expired before approval finished. "
            "Start Connect Account again.")

    def fetch_username(self, token):
        """Best-effort lookup of the account behind the key. May be None."""
        try:
            status, body = http_request(
                "GET",
                self.auth_base + USERINFO_PATH,
                headers={"Authorization": "Bearer " + token},
                timeout=self.timeout,
                opener=self.opener)
        except PollinationsError:
            return None
        if 200 <= status < 300 and isinstance(body, dict):
            return body.get("preferred_username") or body.get("name")
        return None


def default_app_key():
    """The App Key used for attribution; env var beats the built-in default."""
    return os.environ.get("POLLINATIONS_APP_KEY") or DEFAULT_APP_KEY


# ---------------------------------------------------------------------------
# Model catalog helpers
# ---------------------------------------------------------------------------

def catalog_models(body):
    """Filter /image/models to actual image models (skips other categories)."""
    if not isinstance(body, list):
        return []
    return [model for model in body
            if isinstance(model, dict) and model.get("category") == "image"]


def supports_image_input(model):
    """True when the model advertises image input (usable for Edit with AI)."""
    return "image" in (model.get("input_modalities") or [])


def has_resolutions(model):
    """True when the model advertises fixed resolution tiers."""
    return bool(model.get("resolutions"))


def sort_models(models):
    """Official models first, then community ones; each alphabetical."""
    return sorted(
        models,
        key=lambda m: (bool(m.get("community")),
                       str(m.get("title") or m.get("name") or "").lower()))


def model_label(model):
    """Human-readable combo label: 'Title — name (community)'."""
    title = str(model.get("title") or model.get("name") or "?")
    name = str(model.get("name") or "")
    label = title if not name or name == title else "%s — %s" % (title, name)
    if model.get("community"):
        label += " (community)"
    return label


def resolution_to_size(resolution):
    """Map an advertised tier like '1k'/'2k' to a WIDTHxHEIGHT string."""
    value = str(resolution).strip().lower()
    if "x" in value:
        return value  # already WIDTHxHEIGHT
    try:
        pixels = int(value[:-1]) * 1024 if value.endswith("k") else int(value)
        return "%dx%d" % (pixels, pixels)
    except ValueError:
        return None


# ---------------------------------------------------------------------------
# Pollinations image API client
# ---------------------------------------------------------------------------

class PollinationsClient(object):
    """Authenticated client for the Pollinations image endpoints."""

    def __init__(self, token, api_base=None, timeout=DEFAULT_TIMEOUT,
                 image_timeout=IMAGE_TIMEOUT, opener=None):
        self.token = token
        self.api_base = (api_base or API_BASE_URL).rstrip("/")
        self.timeout = timeout
        self.image_timeout = image_timeout
        self.opener = opener

    def _json_headers(self):
        return {
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
            "Accept": "application/json",
        }

    def list_image_models(self):
        """Fetch the live catalog, including community models.

        Sent with the connected account's key so the response reflects
        exactly the image models available to that account.
        """
        status, body = http_request(
            "GET",
            self.api_base + MODELS_PATH,
            headers={
                "Accept": "application/json",
                "Authorization": "Bearer " + self.token,
            },
            timeout=self.timeout,
            opener=self.opener)
        _raise_for_status(status, body)
        return catalog_models(body)

    def generate_image(self, prompt, model="", size=""):
        """Text-to-image. Returns the generated image as PNG/JPEG bytes."""
        payload = {"prompt": prompt, "response_format": "b64_json"}
        if model:
            payload["model"] = model
        if size:
            payload["size"] = size
        status, body = http_request(
            "POST",
            self.api_base + GENERATE_PATH,
            body=json.dumps(payload).encode("utf-8"),
            headers=self._json_headers(),
            timeout=self.image_timeout,
            opener=self.opener)
        _raise_for_status(status, body)
        return self._image_bytes(body)

    def edit_image(self, prompt, image_bytes, model="", size="",
                   image_mime="image/png", image_name="layer.png"):
        """Edit an image. `image_bytes` is uploaded as multipart form data.

        The result is returned as new image bytes — the caller never
        modifies the source layer.
        """
        fields = {"prompt": prompt}
        if model:
            fields["model"] = model
        if size:
            fields["size"] = size
        body_bytes, content_type = encode_multipart(
            fields, "image", image_name, image_bytes, image_mime)
        status, body = http_request(
            "POST",
            self.api_base + EDIT_PATH,
            body=body_bytes,
            headers={
                "Authorization": "Bearer " + self.token,
                "Content-Type": content_type,
            },
            timeout=self.image_timeout,
            opener=self.opener)
        _raise_for_status(status, body)
        return self._image_bytes(body)

    # -- internals ----------------------------------------------------------

    def _image_bytes(self, body):
        data = (body or {}).get("data") if isinstance(body, dict) else None
        if isinstance(data, list) and data and isinstance(data[0], dict):
            item = data[0]
            b64 = item.get("b64_json")
            if b64:
                return _b64decode(b64)
            url = item.get("url")
            if url:
                return http_download(url, timeout=self.image_timeout,
                                      opener=self.opener)
        raise ApiError(200, "Pollinations returned no image data.")


def _b64decode(text):
    """base64.b64decode with missing padding tolerated."""
    if isinstance(text, str):
        text = text.encode("ascii")
    text += b"=" * (-len(text) % 4)
    return base64.b64decode(text)
