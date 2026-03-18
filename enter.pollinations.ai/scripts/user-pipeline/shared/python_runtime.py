import os
import shutil
import sys


def ensure_python_bin() -> None:
    configured = os.environ.get("PYTHON_BIN")
    if not configured:
        return

    resolved = shutil.which(configured) or configured
    current = os.path.realpath(sys.executable)
    target = os.path.realpath(resolved)
    if current == target:
        return

    os.execv(target, [target, *sys.argv])
