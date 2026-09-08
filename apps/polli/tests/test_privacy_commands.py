import unittest
from types import SimpleNamespace

from src.bot import handle_dm_message


class PrivacyCommandTests(unittest.IsolatedAsyncioTestCase):
    async def test_privacy_commands_provide_contact_without_claiming_erasure(self):
        for command in ("privacy", "privacy policy", "delete data", "delete my data"):
            with self.subTest(command=command):
                replies = []

                async def reply(content, captured=replies):
                    captured.append(content)

                message = SimpleNamespace(
                    content=command,
                    author=SimpleNamespace(id=123),
                    reply=reply,
                )
                await handle_dm_message(message)
                self.assertEqual(len(replies), 1)
                self.assertIn("https://pollinations.ai/privacy", replies[0])
                self.assertIn("hello@pollinations.ai", replies[0])
                self.assertIn("deletion or correction", replies[0])
                self.assertIn("subscriptions only", replies[0])
                self.assertIn("does not erase", replies[0])


if __name__ == "__main__":
    unittest.main()
