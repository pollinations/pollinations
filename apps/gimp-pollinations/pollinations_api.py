"""Pollinations transport and BYOP device flow; Python standard library only."""
import base64
import json
import time
import urllib.error
import urllib.parse
import urllib.request

ENTER = "https://enter.pollinations.ai"
GEN = "https://gen.pollinations.ai"


class ApiError(Exception):
    pass


class Cancelled(ApiError):
    pass


class AuthError(ApiError):
    pass


def request_json(url, payload=None, token=None, timeout=30):
    headers = {"Accept": "application/json"}
    data = None
    if payload is not None:
        headers["Content-Type"] = "application/json"
        data = json.dumps(payload).encode("utf-8")
    if token:
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request(url, data=data, headers=headers)
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        # Never display response bodies: they can echo the bearer credential.
        try:
            error_body = error.read()
        finally:
            error.close()
        if "/api/device/" in url:
            try:
                body = json.loads(error_body)
                if body.get("error") in {"authorization_pending", "slow_down", "access_denied", "expired_token"}:
                    return body
            except (ValueError, AttributeError):
                pass
        if error.code == 401:
            raise AuthError("Authorization expired or was revoked. Connect your account again.") from None
        if error.code == 403:
            raise ApiError("Access denied. Check the model permissions in your Pollinations account or reconnect.") from None
        if error.code == 402:
            raise ApiError("Insufficient Pollen or authorization budget. Add Pollen or adjust the budget in your account.") from None
        if error.code == 429:
            raise ApiError("Rate limit reached. Wait before trying again.") from None
        raise ApiError(f"Pollinations returned HTTP {error.code}. Check the request or try again later.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise ApiError("Connection failed or timed out. Check your network; check account activity before retrying a generation.") from None
    except (ValueError, UnicodeError):
        raise ApiError("Pollinations returned an invalid response. Try again later.") from None


def begin_authorization(app_key):
    if not app_key or not app_key.startswith("pk_"):
        raise ApiError("The publisher must configure POLLINATIONS_GIMP_APP_KEY with a registered App Key before connecting.")
    code = request_json(ENTER + "/api/device/code", {"client_id": app_key})
    if not isinstance(code, dict) or not all(code.get(k) for k in ("device_code", "user_code", "verification_uri", "expires_in")):
        raise ApiError("Invalid device authorization response.")
    code["deadline"] = time.monotonic() + float(code["expires_in"])
    url = urllib.parse.urljoin(ENTER, code.get("verification_uri_complete") or code["verification_uri"])
    if urllib.parse.urlsplit(url)[:2] != urllib.parse.urlsplit(ENTER)[:2]:
        raise ApiError("Unexpected authorization site.")
    code["approval_url"] = url
    return code


def poll_authorization(code, cancel):
    interval = max(5, float(code.get("interval", 5)))
    while time.monotonic() < code["deadline"]:
        if cancel.wait(min(interval, max(0, code["deadline"] - time.monotonic()))):
            raise Cancelled("Connection cancelled.")
        if time.monotonic() >= code["deadline"]:
            break
        result = request_json(ENTER + "/api/device/token", {"device_code": code["device_code"]})
        if cancel.is_set():
            raise Cancelled("Connection cancelled.")
        token = result.get("access_token")
        if isinstance(token, str) and token.startswith("sk_"):
            return token
        error = result.get("error")
        if error == "slow_down":
            interval += 5
        elif error == "access_denied":
            raise ApiError("Authorization declined. Connect again when ready.")
        elif error == "expired_token":
            break
        elif error != "authorization_pending":
            raise ApiError("Authorization failed. Connect again.")
    raise ApiError("Authorization code expired. Connect again to get a new code.")


def load_models(token):
    catalog = request_json(GEN + "/image/models", token=token)
    if not isinstance(catalog, list):
        raise ApiError("Invalid model catalog.")
    models = [m for m in catalog if isinstance(m, dict) and isinstance(m.get("name"), str)
              and "image" in m.get("output_modalities", []) and "video" not in m.get("output_modalities", [])]
    if not models:
        raise ApiError("No image models available. Check your account's model permissions and balance.")
    return models


def generate(token, model, prompt, resolution=None, source=None):
    if not prompt.strip():
        raise ApiError("Enter a prompt.")
    payload = {"model": model["name"], "prompt": prompt, "response_format": "b64_json"}
    if resolution:
        if resolution not in model.get("resolutions", []):
            raise ApiError("This model does not support the selected resolution.")
        payload["resolution"] = resolution
    route = "/v1/images/generations"
    if source is not None:
        if "image" not in model.get("input_modalities", []):
            raise ApiError("Choose a model that supports image input.")
        payload["image"] = "data:image/png;base64," + base64.b64encode(source).decode("ascii")
        route = "/v1/images/edits"
    result = request_json(GEN + route, payload, token, timeout=600)
    try:
        encoded = result["data"][0]["b64_json"]
        data = base64.b64decode(encoded, validate=True)
        if not data:
            raise ValueError()
        return data
    except (KeyError, IndexError, TypeError, ValueError):
        raise ApiError("Generation returned no valid image. Check your account activity before retrying.") from None
