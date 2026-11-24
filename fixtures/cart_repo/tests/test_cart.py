import unittest

from cart import total_cents


class CartTests(unittest.TestCase):
    def test_two_units(self):
        self.assertEqual(total_cents([(350, 2)]), 700)
