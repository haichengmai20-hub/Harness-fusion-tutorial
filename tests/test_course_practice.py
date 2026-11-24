"""Regression examples from the Chinese deployment's 20 original hands-on sections."""

import sys
import unittest
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from tools.course_practice import _extract_chapter, extract_all


class OriginalPractice(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.course = extract_all()

    def blocks(self, chapter):
        sections = self.course[chapter]
        self.assertEqual([section["heading"] for section in sections], ["试一下"])
        return sections[0]["blocks"]

    def test_every_chapter_retains_its_prompts_including_paragraph_only_tasks(self):
        self.assertEqual(list(self.course), [f"s{number:02}" for number in range(1, 21)])
        counts = []
        tags = Counter()
        for chapter in self.course:
            in_prompt_list = False
            prompts = 0
            for block in self.blocks(chapter):
                text = block["text"]
                tags[block["tag"]] += 1
                if text.startswith(("试试", "可以试")):
                    in_prompt_list = True
                elif text.startswith("观察重点"):
                    in_prompt_list = False
                elif in_prompt_list:
                    self.assertIn(block["tag"], ("li", "p"))
                    prompts += 1
            counts.append(prompts)
        self.assertEqual(counts, [3, 4, 4, 3, 3, 3, 3, 3, 4, 3, 3, 4, 3, 4, 3, 2, 1, 1, 3, 5])
        self.assertEqual(tags, {"p": 43, "li": 70, "pre": 21, "blockquote": 1})
        self.assertIn("Watch them auto-claim and work.", self.blocks("s17")[2]["text"])
        self.assertIn("work in isolated directories.", self.blocks("s18")[2]["text"])

    def test_first_chapter_keeps_notice_and_command_whitespace(self):
        blocks = self.blocks("s01")
        self.assertEqual([b["tag"] for b in blocks[:5]], ["blockquote", "p", "pre", "p", "pre"])
        self.assertIn("临时测试目录", blocks[0]["text"])
        self.assertEqual(blocks[2]["text"], "pip install -r requirements.txt\ncp .env.example .env\n# 编辑 .env，填入 ANTHROPIC_API_KEY 和 MODEL_ID\n")
        self.assertEqual(blocks[4]["text"], "python s01_agent_loop/code.py\n")
        self.assertEqual(blocks[6]["text"], 'Create a file called hello.py that prints "Hello, World!"')

    def test_observations_keep_their_original_position_and_list_type(self):
        blocks = self.blocks("s10")
        self.assertEqual(blocks[1]["text"], "观察重点：")
        self.assertEqual(blocks[5]["text"], "试试这些 prompt：")
        self.assertIn("[assembled] sections: ...", blocks[2]["text"])
        self.assertIn("Read the file README.md", blocks[6]["text"])
        final = self.blocks("s20")
        self.assertEqual([b["list"] for b in final if b["tag"] == "li"], ["ol"] * 5 + ["ul"] * 7)
        self.assertEqual(final[-1]["text"], "worktree 绑定后，队友是否切到对应目录")

    def test_section_boundary_excludes_sidebar_appendices_and_hydration_duplicates(self):
        html = """<nav><h2>练习</h2><p>导航</p></nav><div class="prose-custom"><h2>试一下</h2>
        <p>先看 <code>x &lt; y</code>。</p><ol start="4"><li>第一个</li><li>后一个</li></ol>
        <h2>接下来</h2><details><h3>七、作业数上限</h3><p>附录</p></details></div>
        <script>缓存文字：试一下</script>"""
        self.assertEqual(_extract_chapter(html), [{"heading": "试一下", "blocks": [
            {"tag": "p", "text": "先看 x < y。"},
            {"tag": "li", "list": "ol", "start": 4, "text": "第一个"},
            {"tag": "li", "list": "ol", "text": "后一个"},
        ]}])


if __name__ == "__main__":
    unittest.main()
