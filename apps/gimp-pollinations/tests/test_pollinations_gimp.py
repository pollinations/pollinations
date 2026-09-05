import base64
import json
import subprocess
import tempfile
import unittest
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import Request

import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from pollinations_gimp import (
    ImageModel,
    PollinationsClient,
    PollinationsError,
    SlowDownError,
    TokenStore,
)


class FakeTransport:
    def __init__(self, responses):
        self.responses = list(responses)
        self.requests = []

    def __call__(self, request: Request) -> bytes:
        self.requests.append(request)
        return json.dumps(self.responses.pop(0)).encode()


class PollinationsClientTest(unittest.TestCase):
    def test_device_flow_uses_app_key_and_waits_for_approval(self):
        transport = FakeTransport(
            [
                {
                    "device_code": "device-secret",
                    "user_code": "ABCD-1234",
                    "verification_uri": "/device",
                    "verification_uri_complete": "/device?user_code=ABCD-1234",
                    "interval": 7,
                },
                {"error": "authorization_pending"},
                {"access_token": "sk_authorized"},
            ]
        )
        client = PollinationsClient(request=transport)
        device = client.start_device_authorization("pk_gimp_app")
        self.assertEqual(device.verification_uri, "https://enter.pollinations.ai/device")
        self.assertEqual(device.interval, 7)
        self.assertIsNone(client.poll_device_authorization(device.device_code))
        self.assertEqual(client.poll_device_authorization(device.device_code), "sk_authorized")
        self.assertEqual(client.token, "sk_authorized")
        self.assertIn(b'"client_id": "pk_gimp_app"', transport.requests[0].data)

    def test_catalog_is_authenticated_and_keeps_only_image_output_models(self):
        transport = FakeTransport(
            [
                [
                    {
                        "name": "community-paint",
                        "title": "Community Paint",
                        "output_modalities": ["image"],
                        "input_modalities": ["text", "image"],
                        "supported_endpoints": ["/v1/images/edits"],
                        "resolutions": ["1k", "2k"],
                        "community": True,
                    },
                    {"name": "video", "output_modalities": ["video"]},
                ]
            ]
        )
        client = PollinationsClient("sk_authorized", transport)
        models = client.list_image_models()
        self.assertEqual([model.id for model in models], ["community-paint"])
        self.assertTrue(models[0].accepts_image)
        self.assertEqual(
            transport.requests[0].get_header("Authorization"),
            "Bearer sk_authorized",
        )

    def test_edit_support_uses_the_advertised_endpoint(self):
        transport = FakeTransport(
            [
                [
                    {
                        "name": "zimage",
                        "title": "Z-Image",
                        "output_modalities": ["image"],
                        "input_modalities": ["text"],
                        "supported_endpoints": ["/image/{prompt}", "/v1/images/edits"],
                    }
                ]
            ]
        )
        model = PollinationsClient("sk_authorized", transport).list_image_models()[0]
        self.assertTrue(model.accepts_image)

    def test_edit_multipart_sends_the_active_layer_file(self):
        encoded = base64.b64encode(b"png-bytes").decode()
        transport = FakeTransport([{"data": [{"b64_json": encoded}]}])
        client = PollinationsClient("sk_authorized", transport)
        with tempfile.NamedTemporaryFile(suffix=".png") as image:
            image.write(b"source-png")
            image.flush()
            result = client.edit(
                "turn it blue",
                ImageModel(
                    "edit",
                    "Edit",
                    ("text", "image"),
                    ("/v1/images/edits",),
                    (),
                ),
                Path(image.name),
                None,
            )
        self.assertEqual(result, b"png-bytes")
        body = transport.requests[0].data
        self.assertIn(b'name="image"; filename="gimp-layer.png"', body)
        self.assertIn(b"source-png", body)

    def test_generate_sends_seed_and_advertised_resolution(self):
        encoded = base64.b64encode(b"png-bytes").decode()
        transport = FakeTransport([{"data": [{"b64_json": encoded}]}])
        model = ImageModel("paint", "Paint", ("text",), (), ("2k",))
        result = PollinationsClient("sk_authorized", transport).generate(
            "a sunflower", model, 1024, 768, "2k", 12345
        )
        self.assertEqual(result, b"png-bytes")
        payload = json.loads(transport.requests[0].data)
        self.assertEqual(payload["resolution"], "2k")
        self.assertEqual(payload["seed"], 12345)

    def test_invalid_app_key_is_not_sent(self):
        with self.assertRaises(PollinationsError):
            PollinationsClient(request=FakeTransport([])).start_device_authorization(
                "sk_not_an_app_key"
            )

    def test_pending_device_http_400_remains_in_the_polling_loop(self):
        pending = HTTPError(
            "https://enter.pollinations.ai/api/device/token",
            400,
            "Bad Request",
            None,
            BytesIO(b'{"error":"authorization_pending"}'),
        )
        with patch("pollinations_gimp.urlopen", side_effect=pending):
            body = PollinationsClient._urlopen(
                Request(
                    "https://enter.pollinations.ai/api/device/token",
                    data=b"{}",
                    method="POST",
                )
            )
        self.assertEqual(json.loads(body), {"error": "authorization_pending"})

    def test_slow_down_is_reported_to_the_poll_scheduler(self):
        client = PollinationsClient(request=FakeTransport([{"error": "slow_down"}]))
        with self.assertRaises(SlowDownError):
            client.poll_device_authorization("device-secret")


class TokenStoreTest(unittest.TestCase):
    def test_linux_keychain_round_trip(self):
        stored = []

        def run(command, **kwargs):
            action = command[1]
            if action == "store":
                stored.append(kwargs["input"])
                output = ""
            elif action == "lookup":
                output = stored[0] if stored else ""
            else:
                stored.clear()
                output = ""
            return subprocess.CompletedProcess(command, 0, output, "")

        store = TokenStore()
        with (
            patch("pollinations_gimp.platform.system", return_value="Linux"),
            patch.object(store, "_run", side_effect=run),
        ):
            store.save("sk_test")
            self.assertEqual(store.load(), "sk_test")
            store.clear()
            self.assertIsNone(store.load())

    def test_windows_keychain_round_trip_keeps_token_out_of_arguments(self):
        stored = []

        def run(command, **kwargs):
            action = command[-1]
            if action == "save":
                self.assertNotIn(kwargs["input"], command)
                stored.append(kwargs["input"])
                output = ""
            elif action == "load":
                output = stored[0] if stored else ""
            else:
                stored.clear()
                output = ""
            return subprocess.CompletedProcess(command, 0, output, "")

        store = TokenStore()
        with (
            patch("pollinations_gimp.platform.system", return_value="Windows"),
            patch.object(store, "_run", side_effect=run),
        ):
            store.save("sk_test")
            self.assertEqual(store.load(), "sk_test")
            store.clear()
            self.assertIsNone(store.load())

    def test_macos_keychain_round_trip(self):
        stored = []

        def save(token):
            stored.append(token)
            return True

        def load():
            return stored[0] if stored else None

        def clear():
            stored.clear()
            return True

        store = TokenStore()
        with (
            patch("pollinations_gimp.platform.system", return_value="Darwin"),
            patch("pollinations_gimp._macos_keychain_save", side_effect=save),
            patch("pollinations_gimp._macos_keychain_load", side_effect=load),
            patch("pollinations_gimp._macos_keychain_clear", side_effect=clear),
        ):
            store.save("sk_test")
            self.assertEqual(store.load(), "sk_test")
            store.clear()
            self.assertIsNone(store.load())


if __name__ == "__main__":
    unittest.main()
