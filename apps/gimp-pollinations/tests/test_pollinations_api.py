import base64
import json
import os
import stat
import sys
import tempfile
import unittest
from unittest import mock
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pollinations_api as api


class PollinationsApiTests(unittest.TestCase):
    def test_catalog_maps_live_shape_and_community_ids(self):
        models = api.parse_image_models([
            {"name":"flux","title":"Flux","input_modalities":["text"],"output_modalities":["image"],"pricing":{"currency":"pollen"}},
            {"name":"owner/community-image","title":"Community","input_modalities":["text","image"],"output_modalities":["image"],"resolutions":["1k","2k"],"max_reference_images":2},
            {"name":"video-only","input_modalities":["text"],"output_modalities":["video"]},
        ])
        self.assertEqual([m.name for m in models], ["flux", "owner/community-image"])
        self.assertTrue(models[1].supports_edit)
        self.assertEqual(models[1].resolutions, ("1k", "2k"))

    def test_token_store_is_private_atomic_and_disconnects(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "auth" / "token.json"
            store = api.TokenStore(path)
            store.save("sk_test_only")
            self.assertEqual(store.load(), "sk_test_only")
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)
            self.assertTrue(store.clear())
            self.assertIsNone(store.load())

    def test_generated_image_detects_media_type(self):
        raw = {"data":[{"b64_json":"/9j/AA=="}]}
        result = api._decode_image_response(raw)
        self.assertEqual(result.media_type, "image/jpeg")
        self.assertEqual(result.suffix, ".jpg")

    def test_error_status_mapping(self):
        self.assertEqual(api._kind_for_status(401), "auth")
        self.assertEqual(api._kind_for_status(402), "payment")
        self.assertEqual(api._kind_for_status(429), "rate_limit")
        self.assertEqual(api._kind_for_status(503), "upstream")

    def test_device_flow_normalizes_verification_url(self):
        response = {
            "device_code": "dev-1",
            "user_code": "ABCD-1234",
            "verification_uri": "/device",
            "interval": 2,
            "expires_in": 10,
        }
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            session = api.start_device_flow("pk_test_app")
        self.assertEqual(session.verification_uri, f"{api.ENTER_BASE}/device")
        self.assertIn("user_code=ABCD-1234", session.verification_uri_complete)
        self.assertEqual(session.interval, 5)
        self.assertEqual(session.expires_in, 30)
        self.assertEqual(request.call_args.kwargs["body"], {"client_id": "pk_test_app", "scope": "generate profile usage"})

    def test_device_poll_pending_slow_down_then_token(self):
        session = api.DeviceSession("dev", "CODE", "https://example/device", "https://example/device?code=CODE", 5, 900)
        with mock.patch.object(
            api,
            "_request_json",
            side_effect=[
                {"error": "authorization_pending"},
                {"error": "slow_down"},
                {"access_token": "sk_" + "delegated_test"},
            ],
        ):
            self.assertIsNone(api.poll_device_token(session))
            self.assertIsNone(api.poll_device_token(session))
            self.assertEqual(session.interval, 10)
            self.assertEqual(api.poll_device_token(session), "sk_" + "delegated_test")

    def test_generation_sends_only_advertised_resolution(self):
        model = api.ImageModel(
            name="owner/image-model", title="Image", description="",
            input_modalities=("text",), output_modalities=("image",),
            resolutions=("1k", "2k"), paid_only=False, pricing={}, max_reference_images=None,
        )
        response = {"data": [{"b64_json": "iVBORw0KGgo="}]}
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            api.generate_image("sk_test", model, "a bee", resolution="2k")
        body = request.call_args.kwargs["body"]
        self.assertEqual(body["model"], "owner/image-model")
        self.assertEqual(body["resolution"], "2k")
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            api.generate_image("sk_test", model, "a bee", resolution="8k")
        self.assertNotIn("resolution", request.call_args.kwargs["body"])

    def test_edit_uses_data_uri_and_rejects_non_edit_model(self):
        editable = api.ImageModel(
            name="owner/editable", title="Editable", description="",
            input_modalities=("text", "image"), output_modalities=("image",),
            resolutions=(), paid_only=False, pricing={}, max_reference_images=1,
        )
        response = {"data": [{"b64_json": "iVBORw0KGgo="}]}
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            api.edit_image("sk_test", editable, "make it blue", b"png-bytes")
        body = request.call_args.kwargs["body"]
        self.assertTrue(body["image"].startswith("data:image/png;base64,"))
        self.assertEqual(body["model"], "owner/editable")

        non_edit = api.ImageModel(
            name="owner/text-only-image", title="No Edit", description="",
            input_modalities=("text",), output_modalities=("image",),
            resolutions=(), paid_only=False, pricing={}, max_reference_images=None,
        )
        with self.assertRaises(api.PollinationsError) as ctx:
            api.edit_image("sk_test", non_edit, "change it", b"png")
        self.assertEqual(ctx.exception.kind, "bad_request")


if __name__ == "__main__":
    unittest.main()

class PollinationsApiPlusTests(unittest.TestCase):
    def test_generation_options_follow_model_capabilities(self):
        model = api.ImageModel(
            name="gptimage-large", title="GPT Image Large", description="",
            input_modalities=("text","image"), output_modalities=("image",),
            resolutions=("1k","2k"), paid_only=False, pricing={}, max_reference_images=16,
            supported_endpoints=("/v1/images/generations","/v1/images/edits"),
        )
        response = {"data": [{"b64_json": "iVBORw0KGgo="}]}
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            api.generate_image(
                "sk_test", model, "a bee", size="768x768", resolution="2k",
                seed=42, quality="high", transparent=True,
            )
        body = request.call_args.kwargs["body"]
        self.assertEqual(body["size"], "768x768")
        self.assertEqual(body["resolution"], "2k")
        self.assertEqual(body["seed"], 42)
        self.assertEqual(body["quality"], "high")
        self.assertTrue(body["transparent"])

    def test_transparency_is_not_sent_to_gpt_image_2(self):
        model = api.ImageModel(
            name="gpt-image-2", title="GPT Image 2", description="",
            input_modalities=("text","image"), output_modalities=("image",),
            resolutions=(), paid_only=False, pricing={}, max_reference_images=16,
        )
        response = {"data": [{"b64_json": "iVBORw0KGgo="}]}
        with mock.patch.object(api, "_request_json", return_value=response) as request:
            api.generate_image("sk_test", model, "a bee", transparent=True)
        self.assertNotIn("transparent", request.call_args.kwargs["body"])

    def test_advisor_catalog_keeps_only_vision_tools_text_models(self):
        raw = {"data": [
            {"id":"good","input_modalities":["text","image"],"output_modalities":["text"],"tools":True,"reasoning":True},
            {"id":"no-tools","input_modalities":["text","image"],"output_modalities":["text"],"tools":False},
            {"id":"no-vision","input_modalities":["text"],"output_modalities":["text"],"tools":True},
        ]}
        with mock.patch.object(api, "_request_json", return_value=raw):
            models = api.fetch_advisor_models("sk_test")
        self.assertEqual([m.id for m in models], ["good"])
        self.assertTrue(models[0].reasoning)

    def test_advisor_review_is_structured_and_model_bounded(self):
        image_model = api.ImageModel(
            name="kontext", title="Kontext", description="edit",
            input_modalities=("text","image"), output_modalities=("image",),
            resolutions=(), paid_only=False, pricing={}, max_reference_images=1,
        )
        raw = {"choices":[{"message":{"content":json.dumps({
            "prompt":"Add a tiny red stamp", "operation":"add",
            "image_model":"not-allowed", "reason":"better context", "warning":""
        })}}]}
        with mock.patch.object(api, "_request_json", return_value=raw) as request:
            review = api.review_prompt(
                "sk_test", "vision-tools", prompt="stamp", task="add",
                candidate_models=[image_model], language="fr", image_bytes=b"png",
                context={"selection_bbox":[1,2,3,4]},
            )
        self.assertEqual(review["image_model"], "kontext")
        body = request.call_args.kwargs["body"]
        self.assertEqual(body["response_format"], {"type":"json_object"})
        content = body["messages"][1]["content"]
        self.assertEqual(content[1]["type"], "image_url")
        self.assertTrue(content[1]["image_url"]["url"].startswith("data:image/png;base64,"))

class HealthAndRmbgApiTests(unittest.TestCase):
    def test_model_monitor_thresholds_match_dashboard(self):
        self.assertEqual(api._health_status(95, 5)[0], "degraded")
        self.assertEqual(api._health_status(80, 20)[0], "off")
        self.assertEqual(api._health_status(99, 1)[0], "on")

    def test_524_is_upstream_model_timeout(self):
        self.assertEqual(api._kind_for_status(524), "model_timeout")
        self.assertIn("fallback", api.PollinationsError("model_timeout", "HTTP 524", 524).recovery.lower())

    def test_health_rows_are_aggregated(self):
        raw = {"data": [
            {"model":"flux","provider":"a","total_requests":90,"status_2xx":88,"errors_5xx":2,"latency_p50_ms":3000,"latency_p95_ms":6000,"avg_latency_ms":3500},
            {"model":"flux","provider":"b","total_requests":10,"status_2xx":9,"errors_5xx":1,"latency_p50_ms":5000,"latency_p95_ms":9000,"avg_latency_ms":5500},
        ]}
        with mock.patch.object(api, "_request_json", return_value=raw):
            h = api.fetch_model_health(60)["flux"]
        self.assertEqual(h.total_requests, 100)
        self.assertEqual(h.errors_5xx, 3)
        self.assertEqual(h.status, "on")
        self.assertEqual(h.latency_p95_ms, 9000)

    def test_clearbackdrop_builds_multipart_and_reads_quota_headers(self):
        class Response:
            headers = {"X-RateLimit-Limit":"100", "X-RateLimit-Remaining":"98", "X-RateLimit-Reset":"123", "X-Cache":"HIT"}
            def __enter__(self): return self
            def __exit__(self, *args): return False
            def read(self): return b"\x89PNG\r\n\x1a\nimage"
        with mock.patch.object(api.urllib.request, "urlopen", return_value=Response()) as urlopen:
            result = api.remove_background_clearbackdrop(b"source-png")
        req = urlopen.call_args.args[0]
        self.assertIn("multipart/form-data", req.headers["Content-type"])
        self.assertEqual(result.remaining, 98)
        self.assertTrue(result.cached)

class FullPlusCapabilityTests(unittest.TestCase):
    def _model(self, name, capabilities=()):
        return api.ImageModel(name=name,title=name,description='',input_modalities=('text',),output_modalities=('image',),resolutions=(),paid_only=False,pricing={},max_reference_images=None,capabilities=capabilities)

    def test_seed_visibility_matches_documented_or_live_capability(self):
        self.assertTrue(self._model('flux').supports_seed)
        self.assertTrue(self._model('seedream5').supports_seed)
        self.assertTrue(self._model('future-model', ('seed',)).supports_seed)
        self.assertFalse(self._model('gpt-image-2').supports_seed)

    def test_grok_image_2_quality_is_supported(self):
        self.assertTrue(self._model('grok-imagine-image-2.0').supports_quality)

class AlphaEditTests(unittest.TestCase):
    def test_edit_sends_transparent_only_for_alpha_model(self):
        model=api.ImageModel(name='gptimage-large',title='x',description='',input_modalities=('text','image'),output_modalities=('image',),resolutions=(),paid_only=False,pricing={},max_reference_images=1,supported_endpoints=('/v1/images/edits',))
        with mock.patch.object(api,'_request_json',return_value={'data':[{'b64_json':base64.b64encode(b'abc').decode()}]}) as request:
            api.edit_image('sk_test',model,'isolate',b'png',transparent=True)
        self.assertTrue(request.call_args.kwargs['body']['transparent'])

class PrPolishApiTests(unittest.TestCase):
    def test_public_model_stats_exposes_human_estimation_inputs(self):
        raw = {"data": [{
            "model": "gptimage", "request_count": 100, "success_count": 80,
            "error_count": 20, "avg_cost_usd": 0.009544, "avg_response_ms": 24678,
        }]}
        with mock.patch.object(api, "_request_json", return_value=raw):
            stats = api.fetch_public_model_stats()["gptimage"]
        self.assertAlmostEqual(stats.avg_cost_pollen, 0.009544)
        self.assertEqual(stats.avg_response_ms, 24678)
        self.assertEqual(stats.request_count, 100)

    def test_advisor_is_explicitly_advisory_and_receives_observed_costs(self):
        model = api.ImageModel(
            name="gptimage", title="GPT Image", description="image edit",
            input_modalities=("text", "image"), output_modalities=("image",),
            resolutions=(), paid_only=False, pricing={"completionImageTokens":"0.000006"}, max_reference_images=1,
        )
        raw = {"choices":[{"message":{"content":json.dumps({
            "prompt":"clean prompt", "operation":"full_edit", "image_model":"gptimage",
            "reason":"best fit", "warning":""
        })}}]}
        with mock.patch.object(api, "_request_json", return_value=raw) as request:
            api.review_prompt(
                "sk_test", "vision-tools", prompt="clean", task="full_edit",
                candidate_models=[model], cost_estimates={"gptimage":0.009544},
            )
        body = request.call_args.kwargs["body"]
        system = body["messages"][0]["content"]
        self.assertIn("advisory only", system)
        user_payload = json.loads(body["messages"][1]["content"][0]["text"])
        self.assertAlmostEqual(user_payload["image_models"][0]["estimated_cost"], 0.009544)


class AccountSurfaceTests(unittest.TestCase):
    def test_profile_and_key_info_use_scoped_account_endpoints(self):
        profile = {"githubUsername":"demo-user","image":"https://example/avatar.png"}
        key = {"valid":True,"type":"secret","name":"gimp-plugin","pollenBudget":5}
        with mock.patch.object(api, "_request_json", side_effect=[profile, key]) as request:
            self.assertEqual(api.fetch_account_profile("sk_test")["githubUsername"], "demo-user")
            self.assertEqual(api.fetch_key_info("sk_test")["pollenBudget"], 5)
        self.assertTrue(request.call_args_list[0].args[0].endswith("/account/profile"))
        self.assertTrue(request.call_args_list[1].args[0].endswith("/account/key"))
