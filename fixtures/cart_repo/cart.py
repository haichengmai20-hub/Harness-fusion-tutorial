"""教学起始快照。价格以整数分表示。"""


def total_cents(items):
    return sum(unit_cents for unit_cents, quantity in items)
