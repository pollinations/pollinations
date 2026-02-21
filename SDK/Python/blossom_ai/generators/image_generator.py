# blossom_ai/generators/image_generator.py

"""
Image Generator using unified endpoints from config.
Supports both GET requests with query params and authentication.
Security-hardened version with proper resource management.
"""

import asyncio
from pathlib import Path
from typing import Optional, Union, Dict, Any, List, Tuple
from urllib.parse import quote

import httpx

from blossom_ai.core.config import ENDPOINTS
from blossom_ai.core.interfaces import (
    ConfigProtocol,
    HttpClientProtocol,
    LoggerProtocol,
    RateLimiterInterface,
    CacheBackendProtocol,
)
from blossom_ai.generators.base_generator import BaseGenerator
from blossom_ai.generators.parameter_builder import ImageParamsV2, DEFAULTS, _Validators
from blossom_ai.core.models import ImageModel, DEFAULT_IMAGE_MODELS
from blossom_ai.core.errors import (
    BlossomError,
    ValidationError,
    EmptyResponseError,
    Blossom520Error,
    RateLimitError,
    AuthenticationError,
)

MAX_SAFE_URL_LENGTH = 2048


class ImageGenerator(BaseGenerator):
    """
    Synchronous image generator with DI and simplified API.
    Security-hardened with proper resource management.
    """

    MAX_RESPONSE_SIZE: int = 50 * 1024 * 1024  # 50MB

    def __init__(
        self,
        config: ConfigProtocol,
        http_client: Optional[HttpClientProtocol] = None,
        logger: Optional[LoggerProtocol] = None,
        rate_limiter: Optional[RateLimiterInterface] = None,
        cache: Optional[CacheBackendProtocol] = None,
    ):
        super().__init__(
            config=config,
            http_client=http_client,
            logger=logger,
            rate_limiter=rate_limiter,
            cache=cache,
        )
        self.logger.info("ImageGenerator initialised", endpoint=ENDPOINTS.IMAGE_GENERATE)

    # ---------- Internal methods ----------
    def _prepare_request_data(self, **kwargs: Any) -> Dict[str, Any]:
        """Prepare request data for image generation."""
        return {
            "prompt": kwargs.get("prompt", ""),
            "model": kwargs.get("model", "flux"),
            "size": kwargs.get("size", "1024x1024"),
            "quality": kwargs.get("quality", "medium"),
            "style": kwargs.get("style", "photorealistic"),
            **kwargs,
        }

    def _parse_response(self, response: httpx.Response) -> bytes:
        """
        Parse and validate image response.
        Handles errors and validates response size.
        """
        # Check response size first
        content_length = len(response.content) if response.content else 0
        if content_length > self.MAX_RESPONSE_SIZE:
            raise BlossomError(
                f"Response too large: {content_length} bytes (max {self.MAX_RESPONSE_SIZE})",
                error_type="FILE_TOO_LARGE_ERROR",
                suggestion="Reduce image dimensions or quality"
            )

        # Handle 520 error specifically
        if response.status_code == 520:
            raise Blossom520Error(
                message="Cloudflare 520 Unknown Error: Configuration or proxy issue",
                context={
                    "url": str(response.url),
                    "method": response.request.method if response.request else "GET"
                }
            )

        if not response.content:
            raise EmptyResponseError(
                "API returned empty image data",
                suggestion="Try different parameters or check API status"
            )

        return response.content

    def _parse_size(self, size: Optional[str]) -> Tuple[int, int]:
        """Parse size string into width and height."""
        if not size:
            return DEFAULTS.IMAGE_WIDTH, DEFAULTS.IMAGE_HEIGHT
        if not isinstance(size, str):
            raise TypeError(f"Size must be string, got {type(size).__name__}")

        parts = size.lower().split('x')
        if len(parts) != 2:
            raise ValueError(f"Invalid size format: {size!r}. Use 'WIDTHxHEIGHT'")

        try:
            width, height = int(parts[0]), int(parts[1])
        except ValueError as e:
            raise ValueError(f"Invalid dimensions in {size!r}") from e

        _Validators.dimensions(width, height)
        return width, height

    def _build_image_url(
        self, prompt: str, model: str, width: int, height: int, **kwargs: Any
    ) -> str:
        """Build image generation URL with query parameters."""
        encoded_prompt = quote(prompt.strip(), safe='')

        if len(encoded_prompt) > MAX_SAFE_URL_LENGTH - 200:
            raise ValidationError(
                f"Prompt too long after URL encoding: {len(encoded_prompt)} chars. "
                f"Max: {MAX_SAFE_URL_LENGTH - 200}"
            )

        base_url = f"{ENDPOINTS.IMAGE_GENERATE}/{encoded_prompt}"

        params = ImageParamsV2(
            model=model,
            width=width,
            height=height,
            seed=kwargs.get("seed", 42),
            quality=kwargs.get("quality", DEFAULTS.IMAGE_QUALITY),
            style=kwargs.get("style"),
            negative_prompt=kwargs.get("negative_prompt", ""),
            enhance=kwargs.get("enhance", False),
            private=kwargs.get("private", False),
            nologo=kwargs.get("nologo", False),
            safe=kwargs.get("safe", False),
            transparent=kwargs.get("transparent", False),
            guidance_scale=kwargs.get("guidance_scale"),
        )

        query_str = params.to_query()
        full_url = f"{base_url}?{query_str}"

        if len(full_url) > MAX_SAFE_URL_LENGTH:
            raise ValidationError(
                f"Generated URL too long: {len(full_url)} chars. "
                f"Max: {MAX_SAFE_URL_LENGTH}. Try shorter prompt or fewer params."
            )

        return full_url

    # ---------- Public API ----------
    async def generate(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: Optional[str] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        save_as: Optional[Union[str, Path]] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        **kwargs: Any,
    ) -> bytes:
        """Generate image with proper validation and error handling."""
        if not isinstance(prompt, str):
            raise TypeError("Prompt must be a string")

        prompt = prompt.strip()
        if not prompt:
            # FIX: Correctly instantiate ValidationError with a message string
            raise ValidationError("Prompt cannot be empty or whitespace only")

        self.logger.info(
            "Generating image",
            prompt=prompt[:100] + "...",
            model=model or "flux"
        )

        if width is None or height is None:
            if size is not None:
                width, height = self._parse_size(size)
            else:
                width = width or DEFAULTS.IMAGE_WIDTH
                height = height or DEFAULTS.IMAGE_HEIGHT

        image_model = ImageModel.from_string(model or "flux")
        url = self._build_image_url(
            prompt=prompt,
            model=image_model,
            width=width,
            height=height,
            quality=quality or DEFAULTS.IMAGE_QUALITY,
            style=style,
            **kwargs
        )

        self.logger.debug("Image generation URL prepared", url=url)

        response = await self._async_request(
            "GET",
            url,
            endpoint_type="image"
        )

        image_data = response.content
        self.logger.info("Image generation completed", size=len(image_data))

        if save_as:
            save_path = Path(save_as)
            await asyncio.get_event_loop().run_in_executor(None, save_path.write_bytes, image_data)
            self.logger.info("Image saved", path=str(save_path))

        return image_data

    def __call__(
        self,
        prompt: str,
        save_as: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> bytes:
        """Synchronous image generation."""
        if not isinstance(prompt, str):
            raise TypeError("Prompt must be a string")

        from blossom_ai.utils.async_utils import _run_async
        return _run_async(self.generate(prompt, save_as=save_as, **kwargs))

    def generate_sync(
        self,
        prompt: str,
        save_as: Optional[Union[str, Path]] = None,
        **kwargs: Any,
    ) -> bytes:
        """Alias for __call__."""
        return self(prompt, save_as=save_as, **kwargs)

    def generate_url(
        self,
        prompt: str,
        model: Optional[str] = None,
        size: Optional[str] = None,
        quality: Optional[str] = None,
        style: Optional[str] = None,
        width: Optional[int] = None,
        height: Optional[int] = None,
        **kwargs: Any,
    ) -> str:
        """Generate URL for image generation without making request."""
        if width is None or height is None:
            if size is not None:
                width, height = self._parse_size(size)
            else:
                width = width or DEFAULTS.IMAGE_WIDTH
                height = height or DEFAULTS.IMAGE_HEIGHT

        image_model = ImageModel.from_string(model or "flux")
        return self._build_image_url(
            prompt=prompt,
            model=image_model,
            width=width,
            height=height,
            quality=quality or DEFAULTS.IMAGE_QUALITY,
            style=style,
            **kwargs
        )

    async def save(
        self,
        prompt: str,
        filename: Union[str, Path],
        **kwargs: Any,
    ) -> Path:
        """Generate and save image to file."""
        image_data = await self.generate(prompt, **kwargs)
        save_path = Path(filename)
        save_path.parent.mkdir(parents=True, exist_ok=True)

        await asyncio.get_event_loop().run_in_executor(None, save_path.write_bytes, image_data)

        self.logger.info("Image saved successfully", filename=str(filename), size=len(image_data))
        return save_path.absolute()

    def models(self) -> List[str]:
        """Return list of available image models."""
        return DEFAULT_IMAGE_MODELS

    # === Resource Management ===

    async def close(self) -> None:
        """Close the generator and cleanup resources."""
        try:
            await super().close()
            self.logger.info("ImageGenerator closed successfully")
        except Exception as e:
            self.logger.error("Error during ImageGenerator shutdown", error=str(e))


class AsyncImageGenerator(ImageGenerator):
    """Async alias with identical implementation."""
    pass