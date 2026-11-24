class CheckQueue:
    """由实验器推进的单步工作队列，不依赖墙钟和线程调度。"""
    def __init__(self):
        self.jobs = {}

    def submit(self, key, repo):
        self.jobs[key] = {"status": "queued", "repo": repo}

    def advance(self, key):
        job = self.jobs[key]
        if job["status"] == "queued":
            job.update(status="finished", result=check_cart(job["repo"]))

    def poll(self, key):
        job = self.jobs[key]
        return {"id": key, "status": job["status"], "result": job.get("result")}


def demo_background(lab, failed):
    execute_tool(lab, "write_fix", {}, "fix")
    queue = CheckQueue()
    queue.submit("job-1", lab.repo)
    lab.event("job-submitted", "立即返回任务 ID，主循环可继续工作", {}, queue.poll("job-1"))
    lab.event("parent-continued", "主循环在结果到达前整理修改说明",
              {"blocked": False}, {"note": "已把单价乘件数", "job": "job-1"})
    if not failed:
        queue.advance("job-1")
    lab.event("job-polled", "按任务 ID 读取验证结果", {"job": "job-1"}, queue.poll("job-1"))


CHAPTERS[13] = demo_background
