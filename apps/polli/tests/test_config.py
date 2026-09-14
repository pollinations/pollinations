import os
import unittest
from unittest.mock import patch

from src.core.config import load_config


class ConfigTests(unittest.TestCase):
    def test_api_bind_can_be_overridden_without_changing_config_json(self):
        with patch.dict(os.environ, {"POLLI_API_BIND": "0.0.0.0"}):
            config = load_config()

        self.assertEqual(config.api.bind, "0.0.0.0")
        self.assertEqual(config.api.port, 55288)
