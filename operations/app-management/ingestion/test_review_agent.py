import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location("review_agent", Path(__file__).with_name("review-agent.py"))
review_agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(review_agent)

APP_URL = "https://example.github.io/app/"
CDN = "https://cdnjs.cloudflare.com/ajax/libs"


class InspectAppTest(unittest.TestCase):
    def test_app_script_after_three_cdn_scripts_is_inspected(self):
        pages = {
            APP_URL: f"""
                <script src="{CDN}/marked/12.0.2/marked.min.js"></script>
                <script src="{CDN}/dompurify/3.1.6/purify.min.js"></script>
                <script src="{CDN}/highlight.js/11.9.0/highlight.min.js"></script>
                <script src="app.js"></script>
            """,
            APP_URL + "app.js": 'fetch("https://gen.pollinations.ai/v1/chat/completions")',
        }
        with patch.object(review_agent, "fetch_public_text", side_effect=lambda url, **_: (url, pages[url])) as fetch:
            evidence = review_agent.inspect_app(APP_URL)
        self.assertEqual([call.args[0] for call in fetch.call_args_list], [APP_URL, APP_URL + "app.js"])
        self.assertEqual(evidence["scripts_checked"], 1)
        self.assertIn("gen.pollinations.ai", evidence["pollinations_markers"])
