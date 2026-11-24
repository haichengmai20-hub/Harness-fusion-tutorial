SKILLS = {"money": "金额以整数分计算；单价乘以件数后求和。"}


def demo_skill(lab, failed):
    catalog = [{"name": "money", "description": "购物车金额规则"}]
    model_input = {"catalog": catalog}
    lab.event("catalog-listed", "先把技能名和用途送入输入", {}, model_input)
    name = "currency" if failed else "money"
    before = deepcopy(model_input)
    body = SKILLS.get(name)
    if body:
        model_input["loadedText"] = body
    lab.event("skill-requested", "按模型请求的名字读取技能正文", before, model_input,
              {"requested": name, "found": body is not None})
    lab.event("request-built", "检查下一轮实际能看到的文字",
              {"requested": name}, {"modelInput": model_input, "bodyVisible": "loadedText" in model_input})


CHAPTERS[7] = demo_skill
