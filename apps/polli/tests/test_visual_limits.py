import unittest

from src.integrations.chart_renderer import _output_dpi
from src.integrations.charts import _aggregate_chart_data, _paginate_table
from src.integrations.diagrams import diagram_viewport


class VisualLimitTests(unittest.TestCase):
    def test_large_table_is_split_into_numbered_pages(self):
        pages = _paginate_table([[str(index)] for index in range(121)])

        self.assertEqual([len(page) for page in pages], [50, 50, 21])

    def test_large_chart_is_aggregated_without_dropping_values(self):
        data = {
            "labels": [str(index) for index in range(250)],
            "datasets": [{"label": "requests", "values": list(range(250))}],
        }

        aggregated, changed = _aggregate_chart_data(data)

        self.assertTrue(changed)
        self.assertLessEqual(len(aggregated["labels"]), 100)
        self.assertEqual(sum(aggregated["datasets"][0]["values"]), sum(range(250)))

    def test_diagram_viewport_never_exceeds_4k(self):
        width, height = diagram_viewport("flowchart LR\n" + " --> ".join(f"N{i}" for i in range(500)))

        self.assertLessEqual(width * 2, 3840)
        self.assertLessEqual(height * 2, 2160)
        self.assertGreaterEqual(width, 1100)

    def test_chart_output_scales_to_4k_without_exceeding_it(self):
        self.assertEqual(_output_dpi(16, 9), 240)
        self.assertLessEqual(16 * _output_dpi(16, 9), 3840)
        self.assertLessEqual(9 * _output_dpi(16, 9), 2160)


if __name__ == "__main__":
    unittest.main()
