import io
import logging
import unittest
from unittest.mock import AsyncMock

from src.ai.client import PollinationsClient
from src.context.manager import SessionManager
from src.core.logging import CleanFormatter


class LoggingSafeguardsTests(unittest.IsolatedAsyncioTestCase):
    def test_formatter_excludes_exception_message_and_traceback(self):
        stream = io.StringIO()
        handler = logging.StreamHandler(stream)
        handler.setFormatter(CleanFormatter())
        logger = logging.getLogger("test.logging.safeguards")
        logger.handlers = [handler]
        logger.setLevel(logging.ERROR)
        logger.propagate = False

        try:
            raise ValueError("private exception body")
        except ValueError:
            logger.exception("operation failed")

        output = stream.getvalue()
        self.assertIn("operation failed (exception=ValueError)", output)
        self.assertNotIn("private exception body", output)
        self.assertNotIn("Traceback", output)

    def test_formatter_handles_missing_exception_class(self):
        record = logging.LogRecord(
            name="test.logging.safeguards",
            level=logging.ERROR,
            pathname=__file__,
            lineno=1,
            msg="operation failed",
            args=(),
            exc_info=(None, None, None),
        )

        output = CleanFormatter().format(record)

        self.assertIn("operation failed (exception=UnknownException)", output)

    def test_session_creation_log_excludes_topic_summary(self):
        manager = SessionManager()
        logger = logging.getLogger("src.context.manager")
        with self.assertLogs(logger, level="INFO") as captured:
            manager.create_session(1, 2, 3, "user", "private body", "private topic")

        self.assertIn("Created session for thread 2", captured.output[0])
        self.assertNotIn("private topic", captured.output[0])

    async def test_process_with_tools_accepts_user_message_keyword(self):
        class SuccessResponse:
            status = 200

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def json(self):
                return {"choices": [{"message": {"content": "ok"}}], "usage": {}}

        client = PollinationsClient()
        session = type("Session", (), {"post": lambda *_args, **_kwargs: SuccessResponse()})()
        client.get_session = AsyncMock(return_value=session)

        result = await client.process_with_tools(
            user_message="private body",
            discord_username="tester",
            raw_messages=[],
        )

        self.assertEqual(result["response"], "ok")

    async def test_generate_text_log_excludes_upstream_error_body(self):
        class ErrorResponse:
            status = 500

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return None

            async def text(self):
                return "secret upstream error body"

        client = PollinationsClient()
        session = type("Session", (), {"post": lambda *_args, **_kwargs: ErrorResponse()})()
        client.get_session = AsyncMock(return_value=session)

        logger = logging.getLogger("src.ai.client")
        with self.assertLogs(logger, level="ERROR") as captured:
            result = await client.generate_text("system", "private prompt")

        self.assertIsNone(result)
        self.assertIn("generate_text error: HTTP 500", captured.output[0])
        self.assertNotIn("secret upstream error body", captured.output[0])


if __name__ == "__main__":
    unittest.main()
