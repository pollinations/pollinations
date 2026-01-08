# tests/test_security.py
"""Additional security tests."""

import pytest
from pathlib import Path
from unittest.mock import patch, MagicMock
import os
from blossom_ai.utils.security import (
    validate_file_path,
    validate_image_file,
    sanitize_filename,
    ensure_safe_directory,
    generate_safe_filename,
)


class TestSecurityEdgeCases:
    """Edge cases for security utilities."""

    def test_validate_file_path_relative_traversal(self, monkeypatch):
        """Test path traversal detection."""
        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)

        with pytest.raises(ValueError, match="Path traversal detected"):
            validate_file_path("../../../etc/passwd")

    def test_validate_file_path_absolute_outside_home(self, monkeypatch):
        """Test absolute path outside home directory."""
        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)

        with pytest.raises(ValueError, match="Path traversal detected"):
            validate_file_path("/usr/bin/malicious")

    def test_validate_image_file_no_magic(self):
        """Test image validation when magic is not available."""
        with patch('blossom_ai.utils.security.MAGIC_AVAILABLE', False):
            old_value = os.getenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK")
            os.environ["BLOSSOM_AI_ALLOW_MAGIC_FALLBACK"] = "true"

            try:
                test_file = Path("test.jpg")
                test_file.write_bytes(b"fake image data")

                try:
                    result = validate_image_file(test_file)
                    assert result == test_file.resolve()
                finally:
                    test_file.unlink(missing_ok=True)
            finally:
                if old_value is None:
                    os.environ.pop("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", None)
                else:
                    os.environ["BLOSSOM_AI_ALLOW_MAGIC_FALLBACK"] = old_value

    def test_validate_image_file_wrong_mime(self, monkeypatch):
        """Test image validation with wrong MIME type."""
        from blossom_ai.utils.security import MAGIC_AVAILABLE

        if not MAGIC_AVAILABLE:
            pytest.skip("magic library not available - cannot test MIME type validation")

        monkeypatch.delenv("BLOSSOM_AI_TEST_MODE", raising=False)
        monkeypatch.setenv("BLOSSOM_AI_ALLOW_MAGIC_FALLBACK", "true")

        with patch('mimetypes.guess_type', return_value=("text/plain", None)):
            test_file = Path("test.jpg")
            test_file.write_bytes(b"not an image")

            try:
                with pytest.raises(ValueError, match="not an image"):
                    validate_image_file(test_file)
            finally:
                test_file.unlink(missing_ok=True)

    def test_sanitize_filename_only_dots(self):
        """Test sanitizing filename with only dots."""
        result = sanitize_filename("...")
        assert result == "..."

    def test_sanitize_filename_unicode(self):
        """Test sanitizing filename with unicode characters."""
        result = sanitize_filename("test_файл_日本語.jpg")
        assert "файл" in result
        assert "日本語" in result

    def test_ensure_safe_directory_readonly(self):
        """Test directory validation when no write permission."""
        with patch('os.access', return_value=False):
            with pytest.raises(ValueError, match="No write permission"):
                ensure_safe_directory("/some/readonly/dir")

    def test_generate_safe_filename_edge_cases(self):
        """Test filename generation edge cases."""
        # Very long prefix
        result = generate_safe_filename(prefix="a" * 200, extension=".png")
        assert len(result) <= 255
        assert result.endswith(".png")

    def test_validate_file_path_special_chars(self):
        """Test path with special characters."""
        test_path = Path("test-dir_123/test.file-name.txt")
        result = validate_file_path(test_path)
        assert result.name == "test.file-name.txt"