# blossom_ai/utils/logging.py - с кэшированием логгеров
import sys
import contextvars
import threading
from typing import Any, Dict, Optional

try:
    import structlog
    STRUCTLOG_AVAILABLE = True
except ImportError:
    STRUCTLOG_AVAILABLE = False

# Кэш логгеров для избежания повторной инициализации
_logger_cache: Dict[str, 'StructuredLogger'] = {}
_logger_cache_lock = threading.Lock()

_correlation_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar("correlation_id", default=None)


def set_correlation_id(correlation_id: Optional[str]) -> None:
    _correlation_id.set(correlation_id)


def get_correlation_id() -> Optional[str]:
    return _correlation_id.get()


def get_cached_logger(name: str = "blossom_ai", level: str = "INFO") -> 'StructuredLogger':
    """Get or create cached logger instance (thread-safe)."""
    cache_key = f"{name}:{level}"

    if cache_key not in _logger_cache:
        with _logger_cache_lock:
            if cache_key not in _logger_cache:
                _logger_cache[cache_key] = StructuredLogger(name, level)

    return _logger_cache[cache_key]


class StructuredLogger:
    def __init__(self, name: str = "blossom_ai", level: str = "INFO") -> None:
        self.name = name
        self.level = level
        self._logger = self._setup_logger()

    def _setup_logger(self) -> Any:
        if STRUCTLOG_AVAILABLE:
            structlog.configure(
                processors=[
                    structlog.stdlib.filter_by_level,
                    structlog.stdlib.add_logger_name,
                    structlog.stdlib.add_log_level,
                    structlog.stdlib.PositionalArgumentsFormatter(),
                    structlog.processors.TimeStamper(fmt="iso"),
                    structlog.processors.StackInfoRenderer(),
                    structlog.processors.format_exc_info,
                    structlog.processors.UnicodeDecoder(),
                    structlog.processors.JSONRenderer()
                ],
                context_class=dict,
                logger_factory=structlog.stdlib.LoggerFactory(),
                wrapper_class=structlog.stdlib.BoundLogger,
                cache_logger_on_first_use=True,
            )
            return structlog.get_logger(self.name)
        else:
            import logging
            logging.basicConfig(
                format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
                level=self.level,
                stream=sys.stdout
            )
            return logging.getLogger(self.name)

    def _add_context(self, kwargs: Dict[str, Any]) -> Dict[str, Any]:
        kwargs.pop("message", None)
        kwargs["logger"] = self.name
        corr_id = get_correlation_id()
        if corr_id:
            kwargs["correlation_id"] = corr_id
        return kwargs

    def debug(self, message: str, **kwargs: Any) -> None:
        context = self._add_context(kwargs)
        if STRUCTLOG_AVAILABLE:
            self._logger.debug(message, **context)
        else:
            self._logger.debug(f"{message} | {context}")

    def info(self, message: str, **kwargs: Any) -> None:
        context = self._add_context(kwargs)
        if STRUCTLOG_AVAILABLE:
            self._logger.info(message, **context)
        else:
            self._logger.info(f"{message} | {context}")

    def warning(self, message: str, **kwargs: Any) -> None:
        context = self._add_context(kwargs)
        if STRUCTLOG_AVAILABLE:
            self._logger.warning(message, **context)
        else:
            self._logger.warning(f"{message} | {context}")

    def error(self, message: str, **kwargs: Any) -> None:
        context = self._add_context(kwargs)
        if STRUCTLOG_AVAILABLE:
            self._logger.error(message, **context)
        else:
            self._logger.error(f"{message} | {context}")

    def exception(self, message: str, **kwargs: Any) -> None:
        context = self._add_context(kwargs)
        if STRUCTLOG_AVAILABLE:
            self._logger.exception(message, **context)
        else:
            self._logger.exception(f"{message} | {context}")