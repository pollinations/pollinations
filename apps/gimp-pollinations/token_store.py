"""Private local authorization: Windows DPAPI; owner-only files on POSIX."""
import ctypes
import os
from pathlib import Path
import sys
import tempfile


def config_dir():
    if sys.platform == "win32":
        return Path(os.environ["LOCALAPPDATA"]) / "PollinationsGimp"
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / "PollinationsGimp"
    return Path(os.environ.get("XDG_CONFIG_HOME", Path.home() / ".config")) / "pollinations-gimp"


def _protect(data, decrypt=False):
    from ctypes import wintypes

    class Blob(ctypes.Structure):
        _fields_ = [("size", wintypes.DWORD), ("data", ctypes.POINTER(ctypes.c_char))]

    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_char)))
    result = Blob()
    crypt = ctypes.WinDLL("crypt32", use_last_error=True)
    kernel = ctypes.WinDLL("kernel32", use_last_error=True)
    kernel.LocalFree.argtypes = [ctypes.c_void_p]
    kernel.LocalFree.restype = ctypes.c_void_p
    fn = crypt.CryptUnprotectData if decrypt else crypt.CryptProtectData
    fn.argtypes = [ctypes.POINTER(Blob), ctypes.c_void_p, ctypes.c_void_p, ctypes.c_void_p,
                   ctypes.c_void_p, wintypes.DWORD, ctypes.POINTER(Blob)]
    fn.restype = wintypes.BOOL
    if not fn(ctypes.byref(source), None, None, None, None, 1, ctypes.byref(result)):
        raise OSError("Windows could not protect the account authorization.")
    try:
        return ctypes.string_at(result.data, result.size)
    finally:
        kernel.LocalFree(result.data)


class TokenStore:
    def __init__(self, directory=None):
        self.directory = Path(directory) if directory is not None else config_dir()
        self.path = self.directory / "authorization"

    def load(self):
        try:
            data = self.path.read_bytes()
            if sys.platform == "win32":
                data = _protect(data, decrypt=True)
            token = data.decode("utf-8")
            return token if token.startswith("sk_") else None
        except (OSError, UnicodeError):
            return None

    def save(self, token):
        if not token.startswith("sk_"):
            raise ValueError("Invalid account authorization.")
        self.directory.mkdir(mode=0o700, parents=True, exist_ok=True)
        data = token.encode("utf-8")
        if sys.platform == "win32":
            data = _protect(data)
        fd, temporary = tempfile.mkstemp(dir=self.directory)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(temporary, self.path)
        finally:
            if os.path.exists(temporary):
                os.unlink(temporary)

    def clear(self):
        self.path.unlink(missing_ok=True)
