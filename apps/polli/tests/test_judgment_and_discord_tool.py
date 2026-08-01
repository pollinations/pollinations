import inspect
import unittest

from src.ai.prompts import BASE_SYSTEM_PROMPT, DISCORD_PROMPT_ADDON
from src.ai.tools import DISCORD_SEARCH_TOOL
from src.bot import format_discord_identity
from src.discord.search import tool_discord_search


class JudgmentPromptTests(unittest.TestCase):
    def test_every_request_requires_judgment_and_concision(self):
        self.assertIn("request for your consideration", BASE_SYSTEM_PROMPT)
        self.assertIn("accept, reinterpret, narrow, challenge, or refuse", BASE_SYSTEM_PROMPT)
        self.assertIn("shortest sufficient answer", BASE_SYSTEM_PROMPT)
        self.assertIn("one or two direct sentences", BASE_SYSTEM_PROMPT)

    def test_bulk_discord_transcripts_are_forbidden(self):
        self.assertIn("Never provide bulk transcripts", DISCORD_PROMPT_ADDON)
        self.assertIn("minimum evidence", DISCORD_PROMPT_ADDON)
        self.assertIn("concise synthesis", DISCORD_PROMPT_ADDON)


class DiscordIdentityTests(unittest.TestCase):
    def test_identity_includes_display_name_and_username(self):
        user = type("User", (), {"display_name": "Thomas", "name": "thomash"})()

        self.assertEqual(format_discord_identity(user), "Thomas (@thomash)")

    def test_prompt_routes_display_name_and_username(self):
        self.assertIn("Use the display name naturally in conversation", DISCORD_PROMPT_ADDON)
        self.assertIn("Use the username or Discord ID for tools", DISCORD_PROMPT_ADDON)


class DiscordToolContractTests(unittest.TestCase):
    def test_top_n_is_required_without_default(self):
        parameters = DISCORD_SEARCH_TOOL["function"]["parameters"]
        top_n = parameters["properties"]["top_n"]

        self.assertIn("top_n", parameters["required"])
        self.assertEqual(top_n["enum"], list(range(1, 101)))
        self.assertNotIn("limit", parameters["properties"])
        self.assertIs(inspect.signature(tool_discord_search).parameters["top_n"].default, inspect.Parameter.empty)


if __name__ == "__main__":
    unittest.main()
