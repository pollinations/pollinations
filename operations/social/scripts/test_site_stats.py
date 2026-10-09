import sys
import unittest
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from generate_site_stats import (
    build_diary_rows,
    coauthor_logins,
    months_since,
    rank_contributors,
    windows,
)


class SiteStatsTest(unittest.TestCase):
    def test_coauthors_come_from_github_noreply_trailers_only(self):
        body = (
            "Adds the app.\n\n"
            "Co-authored-by: Fabio <12345+FabioArieiraBaia@users.noreply.github.com>\n"
            "Co-authored-by: old-style@users.noreply.github.com <old-style@users.noreply.github.com>\n"
            "Co-authored-by: Claude <noreply@anthropic.com>\n"
        )
        self.assertEqual(coauthor_logins(body), {"FabioArieiraBaia", "old-style"})
        self.assertEqual(coauthor_logins(None), set())

    def test_everyone_counts_agents_included_and_coauthors_get_credit(self):
        prs = [
            {"author": {"login": "voodoohop", "avatarUrl": "a", "url": "u"}, "body": ""},
            {"author": {"login": "pollinations-ai", "avatarUrl": "bot", "url": "https://github.com/apps/pollinations-ai"},
             "body": "Co-authored-by: X <1+maker@users.noreply.github.com>"},
            {"author": {"login": "pollinations-ai"}, "body": ""},
            # Naming yourself as co-author does not count twice.
            {"author": {"login": "maker"}, "body": "Co-authored-by: X <1+Maker@users.noreply.github.com>"},
        ]
        ranked = rank_contributors(prs)
        self.assertEqual([(p["login"], p["prs"]) for p in ranked],
                         [("maker", 2), ("pollinations-ai", 2), ("voodoohop", 1)])
        self.assertEqual(ranked[1]["url"], "https://github.com/apps/pollinations-ai")
        self.assertEqual(ranked[0]["avatar_url"], "https://github.com/maker.png?size=80")

    def test_windows_cover_every_day_once(self):
        start, end = date(2025, 10, 10), date(2026, 10, 10)
        days = [d for a, b in windows(start, end) for d in (a + timedelta(n) for n in range((b - a).days + 1))]
        self.assertEqual(days[0], start)
        self.assertEqual(days[-1], end)
        self.assertEqual(len(days), len(set(days)))
        self.assertEqual(len(days), (end - start).days + 1)

    def test_months_since_stops_before_the_current_month(self):
        self.assertEqual(months_since("2025-11", date(2026, 2, 3)), ["2025-11", "2025-12", "2026-01"])

    def test_diary_rows_keep_counts_when_a_write_up_is_missing(self):
        rows = build_diary_rows(
            {"2026-09": 695, "2026-08": 578},
            {"2026-08": {"title": "T", "summary": "S", "image": "I"}, "2026-09": None},
        )
        self.assertEqual(rows, [
            {"month": "2026-08", "merged": 578, "title": "T", "summary": "S", "image": "I"},
            {"month": "2026-09", "merged": 695},
        ])


if __name__ == "__main__":
    unittest.main()
