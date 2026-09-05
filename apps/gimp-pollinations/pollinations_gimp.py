"""Pollinations transport and credential code used by the GIMP 3 plug-in.

This module deliberately has no GIMP dependency, so its protocol behaviour can
be tested with the Python standard library on every supported desktop platform.
"""

from __future__ import annotations

import base64
import ctypes
import json
import os
import platform
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ENTER_URL = "https://enter.pollinations.ai"
GEN_URL = "https://gen.pollinations.ai"
SERVICE_NAME = "pollinations-gimp"
ACCOUNT_NAME = "default"


class PollinationsError(RuntimeError):
    """An error ready to show to a person using the plug-in."""


class ConnectionError(PollinationsError):
    pass


class AuthorizationExpiredError(PollinationsError):
    pass


class SlowDownError(PollinationsError):
    pass


class InsufficientPollenError(PollinationsError):
    pass


@dataclass(frozen=True)
class DeviceAuthorization:
    device_code: str
    user_code: str
    verification_uri: str
    verification_uri_complete: str
    interval: int = 5


@dataclass(frozen=True)
class ImageModel:
    """The capability subset needed by a still-image GIMP workflow."""

    id: str
    title: str
    input_modalities: tuple[str, ...]
    supported_endpoints: tuple[str, ...]
    resolutions: tuple[str, ...]
    community: bool = False

    @property
    def accepts_image(self) -> bool:
        return (
            "image" in self.input_modalities
            or "/v1/images/edits" in self.supported_endpoints
        )


def _error_message(body: bytes, status: int) -> str:
    try:
        payload = json.loads(body.decode("utf-8"))
        error = payload.get("error", payload)
        if isinstance(error, dict):
            return str(error.get("message") or error.get("error") or status)
        return str(error)
    except (UnicodeDecodeError, json.JSONDecodeError):
        return f"Pollinations returned HTTP {status}."


def friendly_error(status: int, detail: str) -> PollinationsError:
    if status in (401, 403):
        return AuthorizationExpiredError(
            "Your Pollinations authorization has expired or was revoked. "
            "Choose Connect and approve access again."
        )
    if status == 402:
        return InsufficientPollenError(
            "This request needs more Pollen. Add Pollen in your Pollinations "
            "account, then try again."
        )
    return PollinationsError(detail)


class PollinationsClient:
    def __init__(
        self,
        token: str | None = None,
        request: Callable[[Request], bytes] | None = None,
    ) -> None:
        self.token = token
        self._request = request or self._urlopen

    @staticmethod
    def _urlopen(request: Request) -> bytes:
        try:
            with urlopen(request, timeout=90) as response:  # nosec B310: fixed API URLs
                return response.read()
        except HTTPError as error:
            body = error.read()
            # RFC 8628 deliberately reports pending/denied/expired device
            # exchanges as 400 responses. Keep their JSON available to the
            # polling state machine instead of showing a false generic error.
            if error.code == 400 and request.full_url.endswith("/api/device/token"):
                try:
                    if json.loads(body.decode("utf-8")).get("error"):
                        return body
                except (UnicodeDecodeError, json.JSONDecodeError):
                    pass
            raise friendly_error(error.code, _error_message(body, error.code)) from error
        except URLError as error:
            raise ConnectionError(
                "Could not reach Pollinations. Check your connection and try again."
            ) from error

    def _json(
        self,
        url: str,
        payload: dict[str, Any] | None = None,
        *,
        token: bool = False,
    ) -> dict[str, Any]:
        headers = {"Accept": "application/json"}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if token:
            if not self.token:
                raise AuthorizationExpiredError(
                    "Connect your Pollinations account first."
                )
            headers["Authorization"] = f"Bearer {self.token}"
        raw = self._request(
            Request(
                url,
                data=data,
                headers=headers,
                method="POST" if data else "GET",
            )
        )
        try:
            return json.loads(raw.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PollinationsError(
                "Pollinations returned an invalid response. Please try again."
            ) from error

    def start_device_authorization(self, app_key: str) -> DeviceAuthorization:
        if not app_key.startswith("pk_"):
            raise PollinationsError(
                "Enter this plug-in's publishable App Key (it starts with pk_)."
            )
        payload = self._json(f"{ENTER_URL}/api/device/code", {"client_id": app_key})
        try:
            verification_uri = urljoin(ENTER_URL, payload["verification_uri"])
            return DeviceAuthorization(
                device_code=payload["device_code"],
                user_code=payload["user_code"],
                verification_uri=verification_uri,
                verification_uri_complete=urljoin(
                    ENTER_URL,
                    payload.get(
                        "verification_uri_complete", payload["verification_uri"]
                    ),
                ),
                interval=max(1, int(payload.get("interval", 5))),
            )
        except (KeyError, TypeError, ValueError) as error:
            raise PollinationsError(
                "Pollinations returned an invalid device authorization response."
            ) from error

    def poll_device_authorization(self, device_code: str) -> str | None:
        payload = self._json(
            f"{ENTER_URL}/api/device/token", {"device_code": device_code}
        )
        if payload.get("error") == "authorization_pending":
            return None
        if payload.get("error") == "slow_down":
            raise SlowDownError("Pollinations asked the plug-in to poll more slowly.")
        if payload.get("error"):
            if payload["error"] in {"expired_token", "access_denied"}:
                raise AuthorizationExpiredError(
                    "The approval request expired or was denied. Choose Connect to start again."
                )
            raise PollinationsError(f"Connection failed: {payload['error']}.")
        access_token = payload.get("access_token")
        if not isinstance(access_token, str) or not access_token.startswith("sk_"):
            raise PollinationsError(
                "Pollinations returned an invalid authorization token."
            )
        self.token = access_token
        return access_token

    def list_image_models(self) -> list[ImageModel]:
        # This request is intentionally authenticated: it includes private/community
        # models visible to this user and filters unavailable paid-only models.
        payload = self._json(f"{GEN_URL}/image/models", token=True)
        if not isinstance(payload, list):
            raise PollinationsError("Pollinations returned an invalid model catalog.")
        models: list[ImageModel] = []
        for raw in payload:
            if not isinstance(raw, dict):
                continue
            outputs = raw.get("output_modalities", [])
            model_id = raw.get("name")
            if "image" not in outputs or not isinstance(model_id, str):
                continue
            models.append(
                ImageModel(
                    id=model_id,
                    title=str(raw.get("title") or model_id),
                    input_modalities=tuple(raw.get("input_modalities") or ()),
                    supported_endpoints=tuple(raw.get("supported_endpoints") or ()),
                    resolutions=tuple(raw.get("resolutions") or ()),
                    community=bool(raw.get("community")),
                )
            )
        return models

    def generate(
        self,
        prompt: str,
        model: ImageModel,
        width: int,
        height: int,
        resolution: str | None,
        seed: int,
    ) -> bytes:
        payload: dict[str, Any] = {
            "prompt": prompt,
            "model": model.id,
            "size": f"{width}x{height}",
            "response_format": "b64_json",
            "seed": seed,
        }
        if resolution:
            payload["resolution"] = resolution
        return self._image_response("/v1/images/generations", payload)

    def edit(
        self,
        prompt: str,
        model: ImageModel,
        image_path: Path,
        resolution: str | None,
    ) -> bytes:
        boundary = "----PollinationsGimpBoundary"
        fields = {"prompt": prompt, "model": model.id}
        if resolution:
            fields["resolution"] = resolution
        body = _multipart_body(boundary, fields, image_path)
        if not self.token:
            raise AuthorizationExpiredError(
                "Connect your Pollinations account first."
            )
        request = Request(
            f"{GEN_URL}/v1/images/edits",
            data=body,
            headers={
                "Accept": "application/json",
                "Authorization": f"Bearer {self.token}",
                "Content-Type": f"multipart/form-data; boundary={boundary}",
            },
            method="POST",
        )
        raw = self._request(request)
        try:
            return self._decode_image(json.loads(raw.decode("utf-8")))
        except (UnicodeDecodeError, json.JSONDecodeError) as error:
            raise PollinationsError(
                "Pollinations returned an invalid image response."
            ) from error

    def _image_response(self, path: str, payload: dict[str, Any]) -> bytes:
        return self._decode_image(self._json(f"{GEN_URL}{path}", payload, token=True))

    @staticmethod
    def _decode_image(payload: dict[str, Any]) -> bytes:
        try:
            encoded = payload["data"][0]["b64_json"]
            return base64.b64decode(encoded, validate=True)
        except (KeyError, IndexError, TypeError, ValueError) as error:
            raise PollinationsError("Pollinations returned an invalid image response.") from error


def _multipart_body(boundary: str, fields: dict[str, str], image_path: Path) -> bytes:
    chunks: list[bytes] = []
    for name, value in fields.items():
        chunks.extend(
            [
                f"--{boundary}\r\n".encode(),
                f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode(),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )
    chunks.extend(
        [
            f"--{boundary}\r\n".encode(),
            b'Content-Disposition: form-data; name="image"; filename="gimp-layer.png"\r\n',
            b"Content-Type: image/png\r\n\r\n",
            image_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode(),
        ]
    )
    return b"".join(chunks)


class TokenStore:
    """Use each desktop's credential service; never put an sk_ key in GIMP prefs."""

    def load(self) -> str | None:
        if platform.system() == "Darwin":
            return _macos_keychain_load()
        result = self._run(self._load_command(), check=False)
        token = result.stdout.strip() if result.returncode == 0 else ""
        return token if token.startswith("sk_") else None

    def save(self, token: str) -> None:
        if platform.system() == "Darwin":
            saved = _macos_keychain_save(token)
        else:
            result = self._run(self._save_command(), input=token, check=False)
            saved = result.returncode == 0
        if not saved:
            raise PollinationsError(
                "GIMP could not save the authorization in your system keychain. "
                "Install/enable your desktop's credential service, then connect again."
            )

    def clear(self) -> None:
        if platform.system() == "Darwin":
            cleared = _macos_keychain_clear()
            if not cleared:
                raise PollinationsError(
                    "GIMP could not remove the authorization from Keychain."
                )
            return
        result = self._run(self._clear_command(), check=False)
        if result.returncode != 0 and self.load() is not None:
            raise PollinationsError(
                "GIMP could not remove the authorization from your system keychain."
            )

    @staticmethod
    def _run(command: list[str], **kwargs: Any) -> subprocess.CompletedProcess[str]:
        try:
            return subprocess.run(command, text=True, capture_output=True, **kwargs)
        except OSError as error:
            return subprocess.CompletedProcess(command, 1, "", str(error))

    @staticmethod
    def _load_command() -> list[str]:
        system = platform.system()
        if system == "Windows":
            return _windows_credential_command("load")
        return ["secret-tool", "lookup", "service", SERVICE_NAME, "account", ACCOUNT_NAME]

    @staticmethod
    def _save_command() -> list[str]:
        system = platform.system()
        if system == "Windows":
            return _windows_credential_command("save")
        return [
            "secret-tool",
            "store",
            "--label=Pollinations GIMP",
            "service",
            SERVICE_NAME,
            "account",
            ACCOUNT_NAME,
        ]

    @staticmethod
    def _clear_command() -> list[str]:
        system = platform.system()
        if system == "Windows":
            return _windows_credential_command("clear")
        return ["secret-tool", "clear", "service", SERVICE_NAME, "account", ACCOUNT_NAME]


def _macos_security():
    security = ctypes.CDLL(
        "/System/Library/Frameworks/Security.framework/Security"
    )
    core_foundation = ctypes.CDLL(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation"
    )
    security.SecKeychainFindGenericPassword.restype = ctypes.c_int32
    security.SecKeychainAddGenericPassword.restype = ctypes.c_int32
    security.SecKeychainItemModifyAttributesAndData.restype = ctypes.c_int32
    security.SecKeychainItemDelete.restype = ctypes.c_int32
    security.SecKeychainItemFreeContent.restype = ctypes.c_int32
    core_foundation.CFRelease.argtypes = [ctypes.c_void_p]
    return security, core_foundation


def _macos_find_item(security):
    service = SERVICE_NAME.encode()
    account = ACCOUNT_NAME.encode()
    length = ctypes.c_uint32()
    data = ctypes.c_void_p()
    item = ctypes.c_void_p()
    status = security.SecKeychainFindGenericPassword(
        None,
        len(service),
        service,
        len(account),
        account,
        ctypes.byref(length),
        ctypes.byref(data),
        ctypes.byref(item),
    )
    return status, length, data, item


def _macos_keychain_load() -> str | None:
    try:
        security, core_foundation = _macos_security()
        status, length, data, item = _macos_find_item(security)
        if status != 0:
            return None
        try:
            token = ctypes.string_at(data, length.value).decode("utf-8")
            return token if token.startswith("sk_") else None
        finally:
            security.SecKeychainItemFreeContent(None, data)
            core_foundation.CFRelease(item)
    except (OSError, UnicodeDecodeError):
        return None


def _macos_keychain_save(token: str) -> bool:
    try:
        security, core_foundation = _macos_security()
        status, _length, data, item = _macos_find_item(security)
        secret = token.encode("utf-8")
        if status == 0:
            security.SecKeychainItemFreeContent(None, data)
            try:
                return (
                    security.SecKeychainItemModifyAttributesAndData(
                        item, None, len(secret), secret
                    )
                    == 0
                )
            finally:
                core_foundation.CFRelease(item)
        service = SERVICE_NAME.encode()
        account = ACCOUNT_NAME.encode()
        return (
            security.SecKeychainAddGenericPassword(
                None,
                len(service),
                service,
                len(account),
                account,
                len(secret),
                secret,
                None,
            )
            == 0
        )
    except OSError:
        return False


def _macos_keychain_clear() -> bool:
    try:
        security, core_foundation = _macos_security()
        status, _length, data, item = _macos_find_item(security)
        if status != 0:
            return True
        security.SecKeychainItemFreeContent(None, data)
        try:
            return security.SecKeychainItemDelete(item) == 0
        finally:
            core_foundation.CFRelease(item)
    except OSError:
        return False


def _windows_credential_command(action: str) -> list[str]:
    # DPAPI encrypts the small local blob to the current Windows account. The
    # PowerShell program reads the token from stdin, never from its arguments.
    path = (
        Path(os.environ.get("APPDATA", str(Path.home())))
        / "PollinationsGimp"
        / "authorization.dpapi"
    )
    script = (
        "$p=$args[0];$a='PollinationsGimp';"
        "if($args[1] -eq 'save'){New-Item -ItemType Directory -Force (Split-Path $p)|Out-Null;"
        "$b=[Text.Encoding]::UTF8.GetBytes([Console]::In.ReadToEnd());"
        "$e=[Security.Cryptography.ProtectedData]::Protect($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);"
        "[IO.File]::WriteAllBytes($p,$e)}"
        "elseif($args[1] -eq 'load'){if(Test-Path $p){$e=[IO.File]::ReadAllBytes($p);"
        "$b=[Security.Cryptography.ProtectedData]::Unprotect($e,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);"
        "[Console]::Write([Text.Encoding]::UTF8.GetString($b))}}"
        "elseif($args[1] -eq 'clear'){Remove-Item -Force $p -ErrorAction SilentlyContinue}"
    )
    return ["powershell", "-NoProfile", "-NonInteractive", "-Command", script, str(path), action]
