import sqlite3
from contextlib import closing


# 一条任务最多有一个前置项。发现与认领使用同一条就绪条件。
READY = """status='pending' AND owner IS NULL AND
           (dependency IS NULL OR EXISTS
               (SELECT 1 FROM task AS prior WHERE prior.name=t.dependency AND prior.status='done'))"""


def seed_tasks(database):
    with closing(sqlite3.connect(database)) as db, db:
        db.execute("CREATE TABLE task(name TEXT PRIMARY KEY, dependency TEXT, status TEXT, owner TEXT)")
        db.execute("INSERT INTO task VALUES ('cart-fix', NULL, 'pending', NULL)")
        db.execute("INSERT INTO task VALUES ('cart-verify', 'cart-fix', 'pending', NULL)")


def discover_tasks(database):
    with closing(sqlite3.connect(database)) as db:
        ready = db.execute("SELECT name FROM task AS t WHERE " + READY + " ORDER BY name").fetchall()
        rows = db.execute("SELECT name, dependency, status, owner FROM task ORDER BY name").fetchall()
    state = {name: {"dependsOn": dep, "status": status, "owner": owner} for name, dep, status, owner in rows}
    return [name for (name,) in ready], state


def claim_task(database, name, worker):
    # 重检同一就绪条件：发现之后，依赖或负责人可能已变。
    with closing(sqlite3.connect(database)) as db, db:
        changed = db.execute("UPDATE task AS t SET owner=?, status='running' WHERE name=? AND " + READY,
                             (worker, name)).rowcount
        current = db.execute("SELECT owner FROM task WHERE name=?", (name,)).fetchone()
    return changed == 1, current[0] if current else None


def scan_candidates(lab, database, worker):
    ready, rows = discover_tasks(database)
    lab.event("ready-discovered", f"{worker} 从持久任务表查询当前可领取项",
              {"tasks": rows}, {"ready": ready}, {"worker": worker})
    return ready


def try_claim(lab, database, worker, candidate):
    won, owner = claim_task(database, candidate, worker)
    lab.event("claim-resolved", f"工作者 {worker} 条件领取 {candidate}",
              {"candidate": candidate}, {"owner": owner, "won": won},
              {"worker": worker, "task": candidate})


def demo_claim(lab, failed):
    database = lab.root / "claims.db"
    seed_tasks(database)
    workers = ["A", "B"] if failed else ["A"]
    # 先收集各工作者当时看到的快照，再交错执行；由此稳定重现竞争窗口。
    snapshots = {worker: scan_candidates(lab, database, worker) for worker in workers}
    for worker, candidates in snapshots.items():
        if candidates:
            try_claim(lab, database, worker, candidates[0])

    # 领用与完成各是一步。本实验保留 owner=A 且修复未完成。
    idle_limit = 2
    for attempt in range(1, idle_limit + 1):
        ready = scan_candidates(lab, database, workers[-1])
        if ready:
            try_claim(lab, database, workers[-1], ready[0])
            return
        lab.event("worker-idle", "本轮没有可领取项", {"attempt": attempt},
                  {"idleCount": attempt, "limit": idle_limit})
    _, tasks = discover_tasks(database)
    lab.event("worker-stopped", "连续两次空闲，结束本次轮询", {"idleCount": idle_limit},
              {"reason": "idle-limit", "allTasksDone": all(t["status"] == "done" for t in tasks.values())})


CHAPTERS[17] = demo_claim
