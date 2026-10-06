import json
import unittest

from generate_models_news import (
    CATEGORIES,
    FEED_PATTERN,
    announcement_changes,
    diff_models,
    update_announcements,
)


def snapshot(*models):
    return {
        category: [model for model in models if model["category"] == category]
        for category in CATEGORIES
    }


def feed(markdown):
    return json.loads(FEED_PATTERN.search(markdown).group(1))


def model(name="example/model", **values):
    return {
        "name": name,
        "title": name,
        "category": "text",
        "community": False,
        "paid_only": False,
        "pricing": {"currency": "pollen", "completionTextTokens": "0.000001"},
        "capabilities": ["reasoning", "tool_calling"],
        **values,
    }


class ModelAnnouncementsTest(unittest.TestCase):
    def test_only_user_visible_changes_and_exact_values(self):
        before = model(health={"status": "healthy"}, provider="first")
        after = model(
            health={"status": "down"},
            provider="second",
            paid_only=True,
            pricing={"currency": "pollen", "completionTextTokens": "0.000002"},
            capabilities=["tool_calling", "reasoning"],
        )
        changes = announcement_changes(before, after)
        self.assertEqual(set(changes), {"paid_only", "pricing"})
        self.assertEqual(changes["paid_only"], {"before": False, "after": True})
        self.assertEqual(changes["pricing"]["after"], after["pricing"])
        self.assertTrue(
            diff_models(
                snapshot(before), snapshot({**before, "health": {"status": "down"}})
            ).is_empty()
        )
        # Opening Quest eligibility does not mean the model becomes zero-price.
        self.assertEqual(
            announcement_changes(after, {**after, "paid_only": False})["paid_only"],
            {"before": True, "after": False},
        )

    def test_daily_retry_window_and_cancelled_schedule(self):
        before, after = model(), model(paid_only=True)
        diff = diff_models(snapshot(before), snapshot(after))
        existing = "# Pollinations Model Changelog\n\n## Older report\nKeep me.\n"
        md = update_announcements(existing, diff, snapshot(after), [], "2026-10-06")
        self.assertEqual(
            update_announcements(md, diff, snapshot(after), [], "2026-10-06"), md
        )
        self.assertIn("Keep me.", md)
        empty = diff_models(snapshot(after), snapshot(after))
        self.assertEqual(
            len(
                feed(
                    update_announcements(md, empty, snapshot(after), [], "2026-10-12")
                )["events"]
            ),
            1,
        )
        self.assertEqual(
            feed(update_announcements(md, empty, snapshot(after), [], "2026-10-13"))[
                "events"
            ],
            [],
        )
        planned = [
            dict(
                model="example/retired",
                title="Retiring",
                category="text",
                date="2026-10-06",
            ),
            dict(model="example/end", title="End", category="text", date="2026-11-05"),
            dict(
                model="example/outside",
                title="Outside",
                category="text",
                date="2026-11-06",
            ),
        ]
        scheduled = update_announcements(
            existing, empty, snapshot(after), planned, "2026-10-06"
        )
        self.assertEqual(len(feed(scheduled)["events"]), 2)
        self.assertEqual(
            feed(
                update_announcements(
                    scheduled, empty, snapshot(after), [], "2026-10-07"
                )
            )["events"],
            [],
        )

    def test_official_additions_removals_and_pending_changes(self):
        old = model("example/old")
        new = model("example/new", title="Safe --> title")
        community = model("community/person/model", community=True)
        pending = model(
            "example/pending",
            pending_change={
                "effective_at": "2026-10-08T00:00:00Z",
                "paid_only": True,
                "pricing": old["pricing"],
            },
        )
        current = snapshot(new, community, pending)
        md = update_announcements(
            "", diff_models(snapshot(old, pending), current), current, [], "2026-10-06"
        )
        events = feed(md)["events"]
        self.assertEqual(
            [event["action"] for event in events], ["New", "Removed", "Updating"]
        )
        self.assertFalse(
            any(event["model"].startswith("community/") for event in events)
        )
        self.assertEqual(events[0]["title"], "Safe --> title")
        self.assertEqual(
            events[2]["changes"], {"paid_only": {"before": False, "after": True}}
        )
        self.assertEqual(md.count("-->"), 1)
        # First-ever catalog collection establishes a baseline, never announces
        # every existing model as new.
        self.assertTrue(diff_models(None, current).is_empty())

    def test_weekly_comparison_still_covers_changes_before_latest_daily_snapshot(self):
        weekly = snapshot(model())
        daily = snapshot(model(paid_only=True))
        current = snapshot(model(paid_only=True))
        self.assertTrue(diff_models(daily, current).is_empty())
        self.assertEqual(len(diff_models(weekly, current).changed["text"]), 1)


if __name__ == "__main__":
    unittest.main()
