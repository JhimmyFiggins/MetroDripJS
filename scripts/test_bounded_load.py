import unittest

import verify_bounded_load as load


class BoundedLoadTests(unittest.TestCase):
    def test_nearest_rank_percentiles_include_tail(self):
        samples = list(range(1, 101))
        self.assertEqual(load.percentile(samples, 50), 50)
        self.assertEqual(load.percentile(samples, 95), 95)
        self.assertEqual(load.percentile(samples, 99), 99)

    def test_probe_is_bounded_and_read_only(self):
        self.assertEqual(load.STAGES, ((1, 40), (4, 80), (8, 120), (16, 160)))
        self.assertTrue(all(path.startswith('/') for path, _ in load.PATHS))
        self.assertTrue(all(status in (200, 401) for _, status in load.PATHS))


if __name__ == '__main__':
    unittest.main()
