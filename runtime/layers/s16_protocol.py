def receive_message(inbox, envelope):
    if envelope["id"] in inbox:
        return "duplicate"
    if envelope["to"] != "reviewer" or envelope["type"] != "review-request":
        return "unroutable"
    inbox[envelope["id"]] = envelope
    return "accepted"


def demo_protocol(lab, failed):
    inbox = {}
    message = {"id": "msg-1", "taskId": "cart-fix", "from": "builder",
               "to": "reviewer", "type": "review-request", "file": "cart.py"}
    lab.event("message-sent", "发送有类型和关联 ID 的复核请求", {}, message, span="builder")
    for _ in range(2 if failed else 1):
        before = list(inbox)
        status = receive_message(inbox, message)
        lab.event("message-received", "收件箱检查路由与消息 ID",
                  {"receivedIds": before}, {"receivedIds": list(inbox), "status": status},
                  {"messageId": message["id"], "taskId": message["taskId"]}, span="reviewer")


CHAPTERS[16] = demo_protocol
