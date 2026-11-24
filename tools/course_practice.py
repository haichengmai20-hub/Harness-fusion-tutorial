"""Read the original hands-on sections from the deployed Chinese course snapshot."""

from dataclasses import dataclass, field
from html.parser import HTMLParser
from pathlib import Path


CHAPTERS = Path(__file__).resolve().parents[1] / "upstream" / "site" / "zh"
PRACTICE_HEADINGS = {"试一下", "试一试", "动手练习", "动手实验", "挑战", "课后作业"}
VOID_TAGS = set("area base br col embed hr img input link meta param source track wbr".split())


@dataclass
class Element:
    tag: str
    children: list = field(default_factory=list)
    start: int = 1

    def text(self):
        if self.tag == "br":
            return "\n"
        return "".join(child if isinstance(child, str) else child.text() for child in self.children)

    def elements(self):
        return (child for child in self.children if isinstance(child, Element))


class CourseProse(HTMLParser):
    """Collect lesson prose only; the Next hydration scripts repeat the same content."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.articles = []
        self.stack = []

    def handle_starttag(self, tag, attrs):
        if self.stack:
            element = Element(tag)
            self.stack[-1].children.append(element)
        elif "prose-custom" in (dict(attrs).get("class") or "").split():
            element = Element(tag)
            self.articles.append(element)
        else:
            return
        if tag == "ol" and (start := dict(attrs).get("start")) is not None:
            element.start = int(start)
        if tag not in VOID_TAGS:
            self.stack.append(element)

    def handle_endtag(self, tag):
        if self.stack and self.stack[-1].tag == tag:
            self.stack.pop()

    def handle_data(self, data):
        if self.stack:
            self.stack[-1].children.append(data)


def _read_section(element):
    if element.tag in {"ol", "ul"}:
        for index, item in enumerate(element.elements()):
            if item.tag != "li":
                raise ValueError(f"Unexpected list child in exercise: {item.tag}")
            block = {"tag": "li", "list": element.tag, "text": item.text().strip()}
            if element.tag == "ol" and index == 0 and element.start != 1:
                block["start"] = element.start
            yield block
    elif element.tag == "pre":
        yield {"tag": "pre", "text": element.text()}
    elif element.tag in {"blockquote", "p", "h3", "h4"}:
        yield {"tag": element.tag, "text": element.text().strip()}
    elif element.tag != "hr":
        raise ValueError(f"Unexpected exercise element: {element.tag}")


def _extract_chapter(html):
    prose = CourseProse()
    prose.feed(html)
    prose.close()
    sections = []
    for article in prose.articles:
        current = None
        for element in article.elements():
            if element.tag in {"h1", "h2"}:
                heading = element.text().strip()
                current = None
                if heading in PRACTICE_HEADINGS:
                    current = {"heading": heading, "blocks": []}
                    sections.append(current)
            elif current is not None:
                current["blocks"].extend(_read_section(element))
    if not sections or any(not section["blocks"] for section in sections):
        raise ValueError("Missing original exercise section or its contents")
    return sections


def extract_all():
    """Return sections and ordered text blocks for s01 through s20. Never runs a command."""
    result = {}
    for number in range(1, 21):
        chapter = f"s{number:02}"
        path = CHAPTERS / chapter / "index.html"
        try:
            result[chapter] = _extract_chapter(path.read_text(encoding="utf-8"))
        except ValueError as error:
            raise ValueError(f"{path}: {error}") from error
    return result
