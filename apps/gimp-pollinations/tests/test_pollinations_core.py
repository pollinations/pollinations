import os
import stat
import sys
import tempfile
import unittest
from dataclasses import dataclass
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import pollinations_core as core
import pollinations_i18n as i18n

@dataclass
class Image:
    name: str
    title: str = ""
    description: str = ""
    supports_edit: bool = False
    community: bool = False
    paid_only: bool = False
    max_reference_images: int | None = None
    pricing: dict | None = None

    def __post_init__(self):
        if self.pricing is None:
            self.pricing = {}


@dataclass
class Advisor:
    id: str
    input_modalities: tuple[str, ...]
    output_modalities: tuple[str, ...]
    tools: bool
    reasoning: bool = False
    pricing: dict | None = None

    def __post_init__(self):
        if self.pricing is None:
            self.pricing = {}


class CoreTests(unittest.TestCase):
    def test_settings_store_private_and_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "pollinations" / "settings.json"
            store = core.SettingsStore(path)
            settings = core.Settings(language="fr", edit_model="kontext", first_run_done=True)
            store.save(settings)
            loaded = store.load()
            self.assertEqual(loaded.language, "fr")
            self.assertEqual(loaded.edit_model, "kontext")
            self.assertTrue(loaded.first_run_done)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
            self.assertEqual(stat.S_IMODE(path.parent.stat().st_mode), 0o700)

    def test_auto_context_prefers_context_specialist(self):
        models = [
            Image("cheap-edit", supports_edit=True, description="editing", pricing={"completionImageTokens":"0.001"}),
            Image("nova-canvas", supports_edit=True, description="Image generation with editing and inpainting tools", pricing={"completionImageTokens":"0.04"}),
        ]
        ranked = core.sorted_image_models(models, "context")
        self.assertEqual(ranked[0].name, "nova-canvas")

    def test_configured_image_model_wins_when_compatible(self):
        models = [Image("kontext", supports_edit=True), Image("nova-canvas", supports_edit=True)]
        settings = core.Settings(edit_model="kontext")
        self.assertEqual(core.pick_image_model(models, "edit", settings.edit_model, settings).name, "kontext")

    def test_incompatible_configured_edit_model_falls_back(self):
        models = [Image("text-only", supports_edit=False), Image("kontext", supports_edit=True)]
        settings = core.Settings(edit_model="text-only")
        self.assertEqual(core.pick_image_model(models, "edit", settings.edit_model, settings).name, "kontext")

    def test_advisor_requires_vision_text_and_tools(self):
        models = [
            Advisor("no-vision", ("text",), ("text",), True),
            Advisor("no-tools", ("text","image"), ("text",), False),
            Advisor("z-ai/glm-5.3-flash", ("text","image"), ("text",), True),
        ]
        ranked = core.sorted_advisor_models(models)
        self.assertEqual([m.id for m in ranked], ["z-ai/glm-5.3-flash"])

    def test_i18n_has_six_languages_and_fallback(self):
        self.assertEqual(set(i18n.SUPPORTED), {"en","fr","es","de","it","zh"})
        self.assertEqual(i18n.tr("menu.generate", "fr"), "Générer une image…")
        self.assertEqual(i18n.tr("context.help", "es"), i18n.EN["context.help"])


if __name__ == "__main__":
    unittest.main()

class HealthFallbackTests(unittest.TestCase):
    @dataclass
    class Health:
        status: str = "on"
        latency_p50_ms: float | None = 3000
        error_rate_pct: float = 0.0
        low_sample: bool = False

    def test_health_degraded_model_is_not_auto_primary(self):
        models = [Image("gpt-image-2"), Image("flux")]
        settings = core.Settings()
        health = {
            "gpt-image-2": self.Health(status="degraded", latency_p50_ms=42000, error_rate_pct=6.0),
            "flux": self.Health(status="on", latency_p50_ms=3500, error_rate_pct=0.2),
        }
        self.assertEqual(core.pick_image_model(models, "generation", "auto", settings, health).name, "flux")

    def test_auto_fallback_is_different_and_quest_preferred(self):
        primary = Image("flux", paid_only=False)
        quest = Image("zimage", paid_only=False)
        paid = Image("p-image", paid_only=True)
        settings = core.Settings(prefer_quest_models=True)
        fb = core.pick_image_fallback([primary, paid, quest], "generation", "auto", primary, settings)
        self.assertEqual(fb.name, "zimage")

    def test_dimension_presets_are_not_square_only(self):
        ratios = {name for name, _, _ in core.ASPECT_PRESETS}
        self.assertTrue({"1:1", "16:9", "9:16", "4:3"}.issubset(ratios))
        self.assertEqual(core.validate_dimensions(100, 5000), (256, 4096))

class RmbgSettingsTests(unittest.TestCase):
    def test_rmbg_defaults_to_auto_with_free_fallback(self):
        settings = core.Settings()
        self.assertEqual(settings.rmbg_provider, 'clearbackdrop')

class FullPlusRankingTests(unittest.TestCase):
    class H:
        def __init__(self,status='on',p50=1000,p95=2000,error=0):
            self.status=status; self.latency_p50_ms=p50; self.latency_p95_ms=p95; self.error_rate_pct=error; self.low_sample=False

    def test_tail_latency_penalizes_auto_candidate(self):
        fast_tail = self.H(p50=400, p95=50000)
        stable = self.H(p50=1500, p95=4000)
        self.assertLess(core._health_adjustment(fast_tail), core._health_adjustment(stable))

    def test_manual_auto_fallback_is_opt_in(self):
        settings = core.Settings()
        self.assertFalse(settings.allow_manual_auto_fallback)
