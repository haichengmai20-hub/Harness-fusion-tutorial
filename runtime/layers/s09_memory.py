def open_session(memory_file):
    recalled = json.loads(memory_file.read_text(encoding="utf-8")) if memory_file.exists() else {}
    return {"messages": [], "recalled": recalled}


def demo_memory(lab, failed):
    memory = lab.root / "preferences.json"
    first = open_session(memory)
    first["messages"].append({"role": "user", "content": "回归测试名用英文。"})
    if not failed:
        memory.write_text(json.dumps({"testNames": "English"}), encoding="utf-8")
    lab.event("session-closed", "结束 A 会话并检查偏好是否写入文件", first,
              {"persisted": memory.exists()}, {"file": "preferences.json"})
    second = open_session(memory)
    lab.event("memory-recalled", "新建空消息的 B 会话，读取偏好", {"session": "B"},
              second, {"readFrom": "preferences.json" if memory.exists() else None})


CHAPTERS[9] = demo_memory
