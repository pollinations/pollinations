# blossom_ai/utils/security.py
"""
Security and file validation utilities.
"""

import os
import re
from pathlib import Path
from typing import Union
import mimetypes
import uuid
from datetime import datetime

try:
    import magic

    MAGIC_AVAILABLE = True
    try:
        magic.from_buffer(b"test", mime=True)
    except Exception:
        MAGIC_AVAILABLE = False
except ImportError:
    MAGIC_AVAILABLE = False

# Configuration for magic fallback behavior
ALLOW_MAGIC_FALLBACK = os.getenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", "false").lower() == "true"

# Path constraints
MAX_PATH_LENGTH = 255
MAX_FILENAME_LENGTH = 100
ALLOWED_IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'}

def _is_test_mode():
    """Check if test mode is enabled dynamically."""
    return os.getenv("BLOSSOM_AI_TEST_MODE", "false").lower() == "true"

__all__ = [
    "MAGIC_AVAILABLE",
    "TEST_MODE",
    "ALLOW_MAGIC_FALLBACK",
    "validate_file_path",
    "validate_image_file",
    "sanitize_filename",
    "ensure_safe_directory",
    "generate_safe_filename",
]

TEST_MODE = _is_test_mode()

def validate_file_path(file_path: Union[str, Path]) -> Path:
    """
    Validate a file path for security.

    Args:
        file_path: Path to the file.

    Returns:
        Validated resolved path.

    Raises:
        ValueError: If the path is unsafe.
    """
    path = Path(file_path).resolve()

    # In test mode, allow any paths
    if _is_test_mode():
        return path

    # Check path length
    if len(str(path)) > MAX_PATH_LENGTH:
        raise ValueError(f"Path too long (max {MAX_PATH_LENGTH} characters)")

    # Check filename length
    if len(path.name) > MAX_FILENAME_LENGTH:
        raise ValueError(f"Filename too long (max {MAX_FILENAME_LENGTH} characters)")

    # Prevent path traversal attacks
    try:
        current_dir = Path.cwd().resolve()
        path.relative_to(current_dir)
    except ValueError:
        # Path is outside current directory, check if it's under home directory
        home_dir = Path.home().resolve()
        try:
            path.relative_to(home_dir)
        except ValueError:
            raise ValueError("Path traversal detected - file must be in home directory or subdirectory")

    # Check for forbidden characters
    forbidden_chars = ['<', '>', ':', '"', '|', '?', '*']
    if any(char in path.name for char in forbidden_chars):
        raise ValueError(f"Filename contains forbidden characters: {forbidden_chars}")

    # No hidden files or system names
    if path.name.startswith('.'):
        raise ValueError("Hidden files are not allowed")

    # Check for Windows reserved names
    system_names = {'CON', 'PRN', 'AUX', 'NUL', 'COM1', 'COM2', 'COM3', 'COM4',
                    'LPT1', 'LPT2', 'LPT3', 'LPT4'}
    if path.name.upper().split('.')[0] in system_names:
        raise ValueError("System reserved filename detected")

    if path.is_symlink():
        raise ValueError("Symbolic links are not allowed for security reasons")

    return path


def validate_image_file(file_path: Union[str, Path]) -> Path:
    """
    Validate an image file with security checks.

    Args:
        file_path: Path to the image file.

    Returns:
        Validated path.

    Raises:
        ValueError: If the file is not a valid image file, has invalid extension,
                   or fails MIME type validation.
        ValueError: If python-magic is not available and fallback is not allowed.
        ValueError: If file size exceeds 10MB limit.

    Note:
        In test mode (BLOSSOM_AI_TEST_MODE=true), only extension validation is performed.
        In production, requires python-magic for accurate MIME type detection or
        BLOSSOM_AI_ALLOW_MAGIC_FALLBACK=true to use mimetypes fallback.
    """
    path = Path(file_path).resolve()

    if _is_test_mode():
        if path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
            raise ValueError(
                f"Invalid image file extension: {path.suffix}. "
                f"Allowed: {ALLOWED_IMAGE_EXTENSIONS}"
            )
        return path

    # Проверка расширения
    if path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        raise ValueError(
            f"Invalid image file extension: {path.suffix}. "
            f"Allowed: {ALLOWED_IMAGE_EXTENSIONS}"
        )

    mime_type = None

    if MAGIC_AVAILABLE:
        try:
            mime = magic.from_file(str(path), mime=True)
            if mime and mime.startswith('image/'):
                mime_type = mime
        except Exception as e:
            if not ALLOW_MAGIC_FALLBACK:
                raise ValueError(
                    f"Failed to validate file with python-magic: {e}. Set BLOSSOM_AI_ALLOW_MAGIC_FALLBACK=true to allow fallback to mimetypes.")
            mime_type, _ = mimetypes.guess_type(str(path))
    else:
        if not ALLOW_MAGIC_FALLBACK:
            raise ValueError(
                "python-magic is not available and fallback is not allowed. "
                "Install python-magic or set BLOSSOM_AI_ALLOW_MAGIC_FALLBACK=true to allow fallback to mimetypes."
            )
        mime_type, _ = mimetypes.guess_type(str(path))

    if not mime_type or not mime_type.startswith('image/'):
        raise ValueError(f"File is not an image (detected: {mime_type})")

    # Check file size (max 10MB)
    max_size = 10 * 1024 * 1024  # 10MB
    if path.stat().st_size > max_size:
        raise ValueError(f"Image file too large (max {max_size} bytes)")

    return path


def sanitize_filename(filename: str) -> str:
    """
    Sanitise a filename by removing dangerous characters.

    Args:
        filename: Original filename.

    Returns:
        Cleaned filename.
    """
    # Replace dangerous characters
    dangerous_chars = r'[<>:"/\\|?*]'
    safe_filename = re.sub(dangerous_chars, '_', filename)

    # Trim whitespace
    safe_filename = safe_filename.strip()

    # Enforce length limit
    if len(safe_filename) > MAX_FILENAME_LENGTH:
        name, ext = os.path.splitext(safe_filename)
        safe_filename = name[:MAX_FILENAME_LENGTH - len(ext)] + ext

    return safe_filename


def ensure_safe_directory(directory: Union[str, Path]) -> Path:
    """
    Ensure a directory is safe and writable.

    Args:
        directory: Path to the directory.

    Returns:
        Safe directory path.

    Raises:
        ValueError: If the directory is not writable.
    """
    dir_path = Path(directory).resolve()
    dir_path.mkdir(parents=True, exist_ok=True)

    if not os.access(dir_path, os.W_OK):
        raise ValueError(f"No write permission to directory: {dir_path}")

    if dir_path.is_symlink():
        raise ValueError("Directory path cannot contain symbolic links")

    return dir_path


def generate_safe_filename(prefix: str = "output", extension: str = ".png") -> str:
    """
    Generate a safe filename with timestamp and random ID.

    Args:
        prefix: Prefix for the filename.
        extension: File extension (e.g., ".png").

    Returns:
        Generated filename (e.g., "image_20241130_123456_abc123.png").
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    random_id = uuid.uuid4().hex[:8]
    return f"{prefix}_{timestamp}_{random_id}{extension}"