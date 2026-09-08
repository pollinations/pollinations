import inspect
import unittest

from src.ai.prompts import BASE_SYSTEM_PROMPT, DISCORD_PROMPT_ADDON
from src.ai.tool_filters import filter_api_tools, filter_tools_by_intent, get_tools_with_embeddings
from src.ai.tools import DISCORD_SEARCH_TOOL, GITHUB_TOOLS, RENDER_VISUAL_TOOL
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
        self.assertEqual(top_n["minimum"], 1)
        self.assertEqual(top_n["maximum"], 25)
        self.assertNotIn("limit", parameters["properties"])
        self.assertIs(inspect.signature(tool_discord_search).parameters["top_n"].default, inspect.Parameter.empty)

    def test_diagram_tool_does_not_claim_discord_renders_mermaid(self):
        description = RENDER_VISUAL_TOOL["function"]["description"]

        self.assertIn("Discord does not render Mermaid fences", description)
        self.assertNotIn("rendered inline automatically", description)

    def test_render_capability_question_keeps_visual_tool(self):
        filtered = filter_tools_by_intent("what all can you render?", [RENDER_VISUAL_TOOL])

        self.assertEqual(filtered, [RENDER_VISUAL_TOOL])

    def test_api_excludes_discord_only_tools_and_actions(self):
        tools = get_tools_with_embeddings(GITHUB_TOOLS, code_search_enabled=True)
        filtered = filter_api_tools(tools)
        by_name = {tool["function"]["name"]: tool for tool in filtered}

        self.assertIn("discord_search", by_name)
        self.assertNotIn("render_visual", by_name)
        discord_actions = by_name["discord_search"]["function"]["parameters"]["properties"]["action"]["enum"]
        self.assertNotIn("members", discord_actions)
        self.assertNotIn("roles", discord_actions)
        issue_actions = by_name["github_issue"]["function"]["parameters"]["properties"]["action"]["enum"]
        self.assertNotIn("subscribe", issue_actions)
        self.assertNotIn("unsubscribe", issue_actions)
        self.assertNotIn("unsubscribe_all", issue_actions)
        self.assertNotIn("list_subscriptions", issue_actions)


if __name__ == "__main__":
    unittest.main()
