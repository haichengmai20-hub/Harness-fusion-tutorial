class MinuteClock:
    def __init__(self):
        self.emitted = set()

    def tick(self, minute):
        if minute % 5 or minute in self.emitted:
            return False
        self.emitted.add(minute)
        return True


def demo_clock(lab, failed):
    clock = MinuteClock()
    queue = CheckQueue()
    for minute in ([4, 5, 5] if failed else [4, 5]):
        before = sorted(clock.emitted)
        triggered = clock.tick(minute)
        if triggered:
            queue.submit(f"check@{minute}", lab.repo)
        lab.event("clock-ticked", f"时钟走到第 {minute} 分钟",
                  {"seen": before}, {"seen": sorted(clock.emitted), "triggered": triggered, "jobs": list(queue.jobs)})


CHAPTERS[14] = demo_clock
