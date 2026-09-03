import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

CLIENT_ID = "pk_gimp_plugin"
BASE_AUTH_URL = "https://enter.pollinations.ai"
DEVICE_CODE_URL = f"{BASE_AUTH_URL}/api/device/code"
DEVICE_TOKEN_URL = f"{BASE_AUTH_URL}/api/device/token"
USERINFO_URL = f"{BASE_AUTH_URL}/api/device/userinfo"
VERIFICATION_URI = f"{BASE_AUTH_URL}/device"


def get_config_dir() -> Path:
    """Returns the platform-specific directory for storing authentication state."""
    if sys.platform == "win32":
        appdata = os.environ.get("APPDATA")
        if appdata:
            base_dir = Path(appdata)
        else:
            base_dir = Path.home() / "AppData" / "Roaming"
    elif sys.platform == "darwin":
        base_dir = Path.home() / "Library" / "Application Support"
    else:
        xdg_config = os.environ.get("XDG_CONFIG_HOME")
        if xdg_config:
            base_dir = Path(xdg_config)
        else:
            base_dir = Path.home() / ".config"

    config_dir = base_dir / "pollinations_gimp"
    config_dir.mkdir(parents=True, exist_ok=True)
    return config_dir


def get_auth_file_path() -> Path:
    return get_config_dir() / "auth.json"


class AuthManager:
    """Manages BYOP Device Flow authentication, persistent token storage, and user info."""

    def __init__(self, client_id: str = CLIENT_ID):
        self.client_id = client_id
        self.auth_file = get_auth_file_path()

    def get_saved_token(self) -> Optional[str]:
        """Loads saved access_token from disk if available."""
        if not self.auth_file.exists():
            return None
        try:
            with open(self.auth_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                return data.get("access_token")
        except Exception:
            return None

    def get_saved_auth_data(self) -> Optional[Dict[str, Any]]:
        """Loads all saved auth data (token, userinfo, etc.)."""
        if not self.auth_file.exists():
            return None
        try:
            with open(self.auth_file, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            return None

    def save_token(self, access_token: str, userinfo: Optional[Dict[str, Any]] = None) -> None:
        """Persists access token and optional userinfo to auth.json."""
        data = {
            "access_token": access_token,
            "saved_at": time.time(),
            "userinfo": userinfo or {},
        }
        with open(self.auth_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)

    def disconnect(self) -> None:
        """Removes saved token and disconnects account."""
        if self.auth_file.exists():
            try:
                self.auth_file.unlink()
            except Exception:
                pass

    def request_device_code(self) -> Dict[str, Any]:
        """
        Initiates device flow by requesting a device code and user code.
        Returns dict with: device_code, user_code, verification_uri, expires_in, interval
        """
        payload = json.dumps({"client_id": self.client_id}).encode("utf-8")
        req = urllib.request.Request(
            DEVICE_CODE_URL,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "PollinationsGimpPlugin/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if "verification_uri" not in res or not res["verification_uri"].startswith("http"):
                    res["verification_uri"] = VERIFICATION_URI
                return res
        except urllib.error.HTTPError as e:
            err_body = e.read().decode("utf-8", errors="replace")
            raise Exception(f"Failed to request device code ({e.code}): {err_body}")
        except Exception as e:
            raise Exception(f"Network error during device code request: {str(e)}")

    def poll_for_token(self, device_code: str) -> Tuple[str, Optional[Dict[str, Any]], Optional[str]]:
        """
        Polls device token endpoint once.
        Returns tuple: (status, token_dict_or_none, error_message_or_none)
        Status values: 'success', 'pending', 'slow_down', 'expired', 'error'
        """
        payload = json.dumps({"device_code": device_code}).encode("utf-8")
        req = urllib.request.Request(
            DEVICE_TOKEN_URL,
            data=payload,
            headers={"Content-Type": "application/json", "User-Agent": "PollinationsGimpPlugin/1.0"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=15) as resp:
                res = json.loads(resp.read().decode("utf-8"))
                if "access_token" in res:
                    return "success", res, None
                err = res.get("error", "")
                if err == "authorization_pending":
                    return "pending", None, None
                elif err == "slow_down":
                    return "slow_down", None, None
                elif err in ("expired_token", "access_denied"):
                    return "expired", None, err
                else:
                    return "error", None, res.get("error_description", err)
        except urllib.error.HTTPError as e:
            try:
                res = json.loads(e.read().decode("utf-8"))
                err = res.get("error", "")
                if err == "authorization_pending":
                    return "pending", None, None
                elif err == "slow_down":
                    return "slow_down", None, None
                elif err in ("expired_token", "access_denied"):
                    return "expired", None, err
                return "error", None, res.get("error_description", f"HTTP {e.code}")
            except Exception:
                return "error", None, f"HTTP Error {e.code}"
        except Exception as e:
            return "error", None, str(e)

    def fetch_userinfo(self, access_token: str) -> Optional[Dict[str, Any]]:
        """Fetches account userinfo for an access token."""
        req = urllib.request.Request(
            USERINFO_URL,
            headers={
                "Authorization": f"Bearer {access_token}",
                "User-Agent": "PollinationsGimpPlugin/1.0",
            },
            method="GET",
        )
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return json.loads(resp.read().decode("utf-8"))
        except Exception:
            return None
